begin;
-- Every calendar operation checks the live membership, never an editable JWT claim.
create function booking_private.require_staff_calendar(target_collaborator uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 if not coalesce(booking_private.active_staff_permission(auth.uid(),target_collaborator,'bookings.read'),false) then raise exception 'Accès refusé' using errcode='42501';end if;
 select b.owner_id into owner from public.collaborators c join public.businesses b on b.id=c.business_id where c.id=target_collaborator;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,8108));
 if not coalesce(booking_private.active_staff_permission(auth.uid(),target_collaborator,'bookings.read'),false) then raise exception 'Accès refusé' using errcode='42501';end if;
 return owner;
end $$;
revoke all on function booking_private.require_staff_calendar(uuid) from public,anon,authenticated;

create function public.get_my_collaborator_calendar() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'salon_name',b.name,'time_zone',b.timezone,'is_bookable',c.is_bookable,
 'hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.weekday,h.starts_at) from public.collaborator_hours h where h.collaborator_id=c.id),'[]'::jsonb),
 'absences',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from public.collaborator_exceptions x where x.collaborator_id=c.id and x.ends_at>now() and x.kind<>'hours'),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(s.title order by s.title) from public.collaborator_services cs join public.provider_services s on s.id=cs.provider_service_id where cs.collaborator_id=c.id and s.is_active and s.archived_at is null),'[]'::jsonb),
 'conflicts',(select count(*) from public.bookings k where k.collaborator_id=c.id and k.starts_at>now() and k.status in ('pending','confirmed') and not booking_private.can_assign(k.provider_service_id,c.id,k.starts_at,k.ends_at,k.id))
 ) order by b.name), '[]'::jsonb)
 from public.collaborators c join public.businesses b on b.id=c.business_id
 where booking_private.active_staff_permission(auth.uid(),c.id,'bookings.read');
$$;
create function public.staff_add_working_hours(target_collaborator uuid,target_weekday integer,target_start time,target_end time) returns uuid
language plpgsql security definer set search_path='' as $$
declare entry uuid;
begin
 perform booking_private.require_staff_calendar(target_collaborator);
 if target_weekday is null or target_weekday not between 0 and 6 or target_start is null or target_end is null or target_start>=target_end then raise exception 'Horaires invalides';end if;
 if exists(select 1 from public.collaborator_hours h where h.collaborator_id=target_collaborator and h.weekday=target_weekday and h.starts_at<target_end and h.ends_at>target_start) then raise exception 'Ce créneau chevauche vos horaires';end if;
 insert into public.collaborator_hours(collaborator_id,weekday,starts_at,ends_at) values(target_collaborator,target_weekday,target_start,target_end) returning id into entry;
 return entry;
end $$;
create function public.staff_add_unavailability(target_collaborator uuid,target_start timestamptz,target_end timestamptz,target_kind text,target_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare entry uuid;
begin
 perform booking_private.require_staff_calendar(target_collaborator);
 if target_start is null or target_end is null or target_start>=target_end or target_end<=now() or target_end-target_start>interval '366 days' or target_kind is null or target_kind not in ('leave','rest','absence') or char_length(coalesce(target_reason,''))>240 then raise exception 'Indisponibilité invalide';end if;
 insert into public.collaborator_exceptions(collaborator_id,starts_at,ends_at,kind,reason) values(target_collaborator,target_start,target_end,target_kind,nullif(trim(target_reason),'')) returning id into entry;
 insert into public.notifications(profile_id,kind,title,body,data) select b.owner_id,'team_availability','Disponibilités modifiées',c.display_name||' a ajouté une indisponibilité.',jsonb_build_object('href','/salon/agenda','collaborator_id',c.id) from public.collaborators c join public.businesses b on b.id=c.business_id where c.id=target_collaborator;
 return entry;
end $$;
create function public.staff_remove_calendar_entry(target_entry uuid,target_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare employee uuid;
begin
 if target_kind='hours' then select collaborator_id into employee from public.collaborator_hours where id=target_entry;
 elsif target_kind='absence' then select collaborator_id into employee from public.collaborator_exceptions where id=target_entry and kind<>'hours';else raise exception 'Type invalide';end if;
 perform booking_private.require_staff_calendar(employee);
 if target_kind='hours' then delete from public.collaborator_hours where id=target_entry and collaborator_id=employee;
 else delete from public.collaborator_exceptions where id=target_entry and collaborator_id=employee and kind<>'hours';end if;
end $$;
revoke all on function public.get_my_collaborator_calendar(),public.staff_add_working_hours(uuid,integer,time,time),public.staff_add_unavailability(uuid,timestamptz,timestamptz,text,text),public.staff_remove_calendar_entry(uuid,text) from public,anon;
grant execute on function public.get_my_collaborator_calendar(),public.staff_add_working_hours(uuid,integer,time,time),public.staff_add_unavailability(uuid,timestamptz,timestamptz,text,text),public.staff_remove_calendar_entry(uuid,text) to authenticated;

-- An owner can attach a WhatsApp invitation to an existing employee record.
-- This preserves that employee's appointments, qualifications and hours.
create function public.create_member_phone_invitation(target_business_id uuid,target_phone text,target_role text,target_permissions text[],target_token_hash text,target_member_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation uuid;
begin
 if not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501';end if;
 if target_member_id is not null then
  perform 1 from public.collaborators c where c.id=target_member_id and c.business_id=target_business_id and c.profile_id is null and c.is_active and c.archived_at is null for update;
  if not found then raise exception 'Fiche employé indisponible' using errcode='42501';end if;
 end if;
 invitation:=public.create_business_phone_invitation(target_business_id,target_phone,target_role,target_permissions,target_token_hash);
 if target_member_id is not null then update public.business_invitations set collaborator_id=target_member_id where id=invitation;end if;
 return invitation;
end $$;
revoke all on function public.create_member_phone_invitation(uuid,text,text,text[],text,uuid) from public,anon;
grant execute on function public.create_member_phone_invitation(uuid,text,text,text[],text,uuid) to authenticated;
create or replace function booking_private.activate_link_invitation(target_claim_id uuid,approve boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare claim booking_private.phone_invitation_claims%rowtype; invitation public.business_invitations%rowtype; permissions text[]; selected_collaborator uuid; actor_name text;
begin
 if auth.uid() is null or approve is distinct from true then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into claim from booking_private.phone_invitation_claims where id=target_claim_id;
 select * into invitation from public.business_invitations where id=claim.invitation_id for update;
 if invitation.id is null or claim.profile_id is distinct from auth.uid() or invitation.recipient_phone is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into claim from booking_private.phone_invitation_claims where id=target_claim_id for update;
 if invitation.status<>'pending' or invitation.expires_at<=now() or claim.status<>'pending' then raise exception 'Invitation ou demande déjà traitée'; end if;
 if not approve then update booking_private.phone_invitation_claims set status='rejected',decided_at=now() where id=claim.id; return null; end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=claim.profile_id and p.account_status='active' and not p.is_suspended and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)) then raise exception 'Compte actif et confirmé requis'; end if;
 select s.permissions into permissions from booking_private.business_invitation_secrets s where s.invitation_id=invitation.id for update;
 if permissions is null then raise exception 'Invitation invalide'; end if;
 select coalesce(nullif(trim(display_name),''),'Équipier') into actor_name from public.profiles where id=claim.profile_id;
 if invitation.collaborator_id is not null then
  select id into selected_collaborator from public.collaborators c where c.id=invitation.collaborator_id and c.business_id=invitation.business_id and c.profile_id is null and c.is_active and c.archived_at is null for update;
  if selected_collaborator is null then raise exception 'Fiche employé déjà associée ou indisponible' using errcode='42501';end if;
  update public.collaborators set profile_id=claim.profile_id,internal_role=invitation.internal_role,updated_at=now() where id=selected_collaborator;
 else
 insert into public.collaborators(business_id,profile_id,display_name,title,internal_role,is_active,is_bookable)
 values(invitation.business_id,claim.profile_id,left(actor_name,100),'Équipe du salon',invitation.internal_role,true,false)
 on conflict(business_id,profile_id) do update set internal_role=excluded.internal_role,is_active=true,archived_at=null,updated_at=now() returning id into selected_collaborator;
 end if;
 insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role,permissions,granted_by,revoked_at)
 values(selected_collaborator,invitation.business_id,claim.profile_id,invitation.internal_role,permissions,invitation.invited_by,null)
 on conflict(collaborator_id) do update set internal_role=excluded.internal_role,permissions=excluded.permissions,granted_by=invitation.invited_by,revoked_at=null,updated_at=now();
 update public.business_invitations set status='accepted',accepted_at=now(),accepted_by=claim.profile_id,collaborator_id=selected_collaborator where id=invitation.id;
 update booking_private.phone_invitation_claims set status=case when id=claim.id then 'approved' else 'rejected' end,decided_at=now() where invitation_id=invitation.id and status='pending';
 delete from booking_private.business_invitation_secrets where invitation_id=invitation.id;
 insert into booking_private.business_invitation_events(business_id,invitation_id,collaborator_id,actor_id,event_type,details) values(invitation.business_id,invitation.id,selected_collaborator,auth.uid(),'accepted',jsonb_build_object('channel','whatsapp','confirmed_profile',claim.profile_id,'permissions',permissions));
 insert into public.notifications(profile_id,kind,title,body,data) select b.owner_id,'salon_collaborator','Invitation acceptée',actor_name||' a rejoint votre équipe.',jsonb_build_object('business_id',b.id,'href','/salon/team') from public.businesses b where b.id=invitation.business_id;
 insert into public.notifications(profile_id,kind,title,body,data) values(claim.profile_id,'salon_collaborator','Accès à l’équipe confirmé','Votre invitation est acceptée. Votre espace équipe est disponible.',jsonb_build_object('business_id',invitation.business_id,'href','/staff'));
 return selected_collaborator;
end; $$;

revoke all on function booking_private.activate_link_invitation(uuid,boolean) from public,anon,authenticated;

create or replace function public.notify_booking_created() returns trigger
language plpgsql security definer set search_path='' as $$
declare service_name text;
begin
 select title into service_name from public.provider_services where id=new.provider_service_id;
 insert into public.notifications(profile_id,kind,title,body,data) values(new.provider_id,'booking_created','Nouvelle demande de réservation',
 coalesce(service_name,'Prestation')||case when new.collaborator_name is null then ' : une nouvelle réservation attend votre réponse.' else ' : réservation attribuée à '||new.collaborator_name||'.' end,
 jsonb_build_object('booking_id',new.id,'source_post_id',new.source_post_id,'href','/salon/bookings#booking-'||new.id));
 return new;
end $$;
revoke all on function public.notify_booking_created() from public,anon,authenticated;
create function booking_private.notify_staff_booking_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare employee uuid; service_name text;
begin
 if new.status is not distinct from old.status or new.collaborator_id is null then return new;end if;
 select c.profile_id into employee from public.collaborators c where c.id=new.collaborator_id and c.is_active and c.archived_at is null;
 if employee is null or employee in (new.client_id,new.provider_id) then return new;end if;
 select s.title into service_name from public.provider_services s where s.id=new.provider_service_id;
 insert into public.notifications(profile_id,kind,title,body,data) values(employee,'booking_status_changed','Rendez-vous mis à jour',
 coalesce(service_name,'Prestation')||' : '||case new.status when 'confirmed' then 'confirmé' when 'cancelled_by_client' then 'annulé par le client' when 'cancelled_by_provider' then 'annulé par le salon' when 'declined' then 'refusé' when 'completed' then 'terminé' when 'in_progress' then 'en cours' else 'statut modifié' end||'.',
 jsonb_build_object('booking_id',new.id,'href','/staff/bookings#booking-'||new.id));
 return new;
end $$;
revoke all on function booking_private.notify_staff_booking_status() from public,anon,authenticated;
create trigger bookings_staff_status_notified after update of status on public.bookings for each row execute function booking_private.notify_staff_booking_status();
do $migration$ declare definition text;begin
 select pg_get_functiondef('booking_private.record_assignment()'::regprocedure) into definition;
 if position('message:=' in definition)=0 then raise exception 'Unexpected assignment notification definition';end if;
 definition:=replace(definition,'message:=','message:=coalesce((select title from public.provider_services where id=new.provider_service_id),''Prestation'')||'' — ''||');
 execute definition;
 select pg_get_functiondef('public.get_staff_booking_agenda_global(date,integer)'::regprocedure) into definition;
 if position('where access.profile_id=auth.uid()' in definition)=0 then raise exception 'Unexpected staff agenda definition';end if;
 execute replace(definition,'where access.profile_id=auth.uid()','where business.archived_at is null and access.profile_id=auth.uid()');
end $migration$;
notify pgrst,'reload schema';
commit;
