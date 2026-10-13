begin;

alter table public.business_invitations
  add column if not exists accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists collaborator_id uuid references public.collaborators(id) on delete set null,
  add column if not exists revoked_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists provider_message_id text;

alter table public.business_invitations drop constraint if exists business_invitations_staff_permissions_check;
alter table public.collaborators drop constraint if exists collaborators_staff_permissions_check;

-- Invitation rows are visible to the salon owner, but no client can mint,
-- accept, or revoke one by writing table rows directly.
drop policy if exists "business owners manage invitations" on public.business_invitations;
revoke insert,update,delete on public.business_invitations from anon,authenticated;
grant select on public.business_invitations to authenticated;
grant all on public.business_invitations to service_role;

create or replace function public.create_business_invitation(
  target_business_id uuid, target_email text, target_role text, target_permissions text[], target_token_hash text
) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.businesses b join public.profiles p on p.id=b.owner_id
    where b.id=target_business_id and b.owner_id=auth.uid() and b.archived_at is null and b.is_active
      and not p.is_suspended and p.account_status='active') then raise exception 'Accès propriétaire requis' using errcode='42501'; end if;
  if target_email is null or lower(trim(target_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(target_email)>254 then raise exception 'Adresse e-mail invalide'; end if;
  if target_role not in ('manager','reception','member') then raise exception 'Rôle invalide'; end if;
  if target_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Jeton invalide'; end if;
  if coalesce(array_length(target_permissions,1),0)=0
    or not target_permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read','clients.read']::text[]
    or ('bookings.manage'=any(target_permissions) and not 'bookings.read'=any(target_permissions))
    or ('messages.reply'=any(target_permissions) and not 'messages.read'=any(target_permissions)) then raise exception 'Permissions invalides'; end if;
  update public.business_invitations set status='expired',token_hash=null
    where business_id=target_business_id and email=lower(trim(target_email)) and status='pending' and expires_at<=now();
  if (select count(*) from public.business_invitations where business_id=target_business_id and invited_by=auth.uid() and created_at>now()-interval '24 hours')>=25 then
    raise exception 'Limite quotidienne d’invitations atteinte' using errcode='54000';
  end if;
  if exists(select 1 from public.collaborators c join public.businesses b on b.id=c.business_id
      join auth.users u on u.id=c.profile_id where b.id=target_business_id and lower(u.email)=lower(trim(target_email)) and c.is_active)
    then raise exception 'Cette personne fait déjà partie du salon'; end if;
  insert into public.business_invitations(business_id,email,internal_role,staff_permissions,invited_by,expires_at,token_hash,status)
  values(target_business_id,lower(trim(target_email)),target_role,target_permissions,auth.uid(),now()+interval '48 hours',target_token_hash,'pending')
  returning id into result;
  return result;
end $$;
revoke all on function public.create_business_invitation(uuid,text,text,text[],text) from public,anon;
grant execute on function public.create_business_invitation(uuid,text,text,text[],text) to authenticated;

create or replace function public.revoke_business_invitation(target_invitation_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.business_invitations i set status='revoked',revoked_at=now(),token_hash=null
  from public.businesses b where i.id=target_invitation_id and i.business_id=b.id and b.owner_id=auth.uid()
    and i.status='pending';
  if not found then raise exception 'Invitation indisponible' using errcode='42501'; end if;
  return true;
end $$;
revoke all on function public.revoke_business_invitation(uuid) from public,anon;
grant execute on function public.revoke_business_invitation(uuid) to authenticated;

create or replace function public.accept_business_invitation(target_invitation_id uuid,target_token_hash text,target_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.business_invitations%rowtype; person public.profiles%rowtype; member_id uuid; member_name text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service serveur requis' using errcode='42501'; end if;
  select * into invitation from public.business_invitations where id=target_invitation_id for update;
  if invitation.id is null or invitation.status<>'pending' or invitation.expires_at<=now()
    or invitation.token_hash is distinct from target_token_hash or target_token_hash !~ '^[0-9a-f]{64}$'
    or not exists(select 1 from auth.users u where u.id=target_user_id and lower(u.email)=invitation.email and u.email_confirmed_at is not null)
    then raise exception 'Invitation invalide, expirée ou adresse différente' using errcode='42501'; end if;
  select * into person from public.profiles where id=target_user_id and not is_suspended and account_status='active';
  if person.id is null then raise exception 'Compte inactif' using errcode='42501'; end if;
  member_name:=coalesce(nullif(trim(coalesce(person.first_name,'')||' '||coalesce(person.last_name,'')),''),nullif(person.display_name,''),'Collaborateur');
  perform set_config('app.accept_business_invitation','true',true);
  insert into public.collaborators(business_id,profile_id,display_name,first_name,public_last_name,internal_role,staff_permissions,is_active,is_bookable)
  values(invitation.business_id,target_user_id,member_name,person.first_name,person.last_name,invitation.internal_role,invitation.staff_permissions,true,false)
  on conflict(business_id,profile_id) do update set display_name=excluded.display_name,internal_role=excluded.internal_role,
    staff_permissions=excluded.staff_permissions,is_active=true,archived_at=null returning id into member_id;
  update public.business_invitations set status='accepted',accepted_at=now(),accepted_by=target_user_id,collaborator_id=member_id,token_hash=null
    where id=invitation.id;
  if 'messages.read'=any(invitation.staff_permissions) then
    insert into public.conversation_members(conversation_id,profile_id)
    select distinct c.id,target_user_id from public.conversations c join public.bookings b on b.id=c.booking_id or b.conversation_id=c.id
    where b.collaborator_id=member_id on conflict(conversation_id,profile_id) do nothing;
  end if;
  insert into public.notifications(profile_id,kind,title,body,data)
  values(invitation.invited_by,'team_invitation','Invitation acceptée',member_name||' a rejoint votre salon.',jsonb_build_object('business_id',invitation.business_id,'href','/salon/team'));
  return jsonb_build_object('collaborator_id',member_id,'business_id',invitation.business_id,'business_name',(select name from public.businesses where id=invitation.business_id));
end $$;
revoke all on function public.accept_business_invitation(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.accept_business_invitation(uuid,text,uuid) to service_role;

create or replace function public.revoke_business_collaborator(target_business_id uuid,target_collaborator_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare employee public.collaborators%rowtype; future_count integer;
begin
  if not exists(select 1 from public.businesses where id=target_business_id and owner_id=auth.uid() and archived_at is null) then raise exception 'Accès propriétaire requis' using errcode='42501'; end if;
  select * into employee from public.collaborators where id=target_collaborator_id and business_id=target_business_id and is_active for update;
  if employee.id is null then raise exception 'Collaborateur indisponible'; end if;
  select count(*) into future_count from public.bookings where collaborator_id=employee.id and starts_at>now() and status in ('pending','confirmed');
  delete from public.conversation_members m using public.conversations c,public.bookings b
    where m.profile_id=employee.profile_id and c.id=m.conversation_id and (b.id=c.booking_id or b.conversation_id=c.id) and b.collaborator_id=employee.id;
  update public.collaborators set profile_id=null,is_active=false,is_bookable=false,staff_permissions='{}' where id=employee.id;
  if future_count>0 then insert into public.notifications(profile_id,kind,title,body,data)
    values(auth.uid(),'team_availability','Réaffectation à vérifier',future_count||' rendez-vous attribué(s) à cet employé doivent être réaffectés.',jsonb_build_object('business_id',target_business_id,'href','/salon/agenda')); end if;
  return true;
end $$;
revoke all on function public.revoke_business_collaborator(uuid,uuid) from public,anon;
grant execute on function public.revoke_business_collaborator(uuid,uuid) to authenticated;

create or replace function public.leave_business(target_business_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare employee public.collaborators%rowtype;
begin
  select * into employee from public.collaborators where business_id=target_business_id and profile_id=auth.uid() and is_active for update;
  if employee.id is null then raise exception 'Accès collaborateur introuvable' using errcode='42501'; end if;
  delete from public.conversation_members m using public.conversations c,public.bookings b
    where m.profile_id=auth.uid() and c.id=m.conversation_id and (b.id=c.booking_id or b.conversation_id=c.id) and b.collaborator_id=employee.id;
  update public.collaborators set profile_id=null,is_active=false,is_bookable=false,staff_permissions='{}' where id=employee.id;
  insert into public.notifications(profile_id,kind,title,body,data)
  select b.owner_id,'team_availability','Un collaborateur a quitté le salon',employee.display_name||' a quitté l’équipe. Vérifiez ses rendez-vous futurs.',jsonb_build_object('business_id',b.id,'href','/salon/team')
  from public.businesses b where b.id=target_business_id;
  return true;
end $$;
revoke all on function public.leave_business(uuid) from public,anon;
grant execute on function public.leave_business(uuid) to authenticated;

drop policy if exists "assigned active staff read bookings" on public.bookings;
drop policy if exists "staff read own active collaborator membership" on public.collaborators;
create policy "staff read own active collaborator membership"
on public.collaborators for select to authenticated using (
  profile_id=auth.uid() and is_active and archived_at is null
);
drop policy if exists "staff read only assigned client profiles" on public.profiles;

create or replace function public.staff_update_booking_status(target_booking_id uuid,target_status text) returns boolean
language plpgsql security definer set search_path='' as $$
declare booking public.bookings%rowtype;
begin
  if auth.uid() is null or target_status not in ('confirmed','declined','in_progress','completed','no_show') then raise exception 'Action non autorisée' using errcode='42501'; end if;
  select b.* into booking from public.bookings b join public.collaborators c on c.id=b.collaborator_id
  where b.id=target_booking_id and c.profile_id=auth.uid() and c.is_active and c.archived_at is null and 'bookings.manage'=any(c.staff_permissions) for update of b;
  if booking.id is null then raise exception 'Rendez-vous inaccessible' using errcode='42501'; end if;
  if not ((booking.status='pending' and target_status in ('confirmed','declined')) or (booking.status='confirmed' and target_status in ('in_progress','no_show')) or (booking.status='in_progress' and target_status='completed')) then raise exception 'Transition de rendez-vous invalide'; end if;
  perform set_config('app.staff_booking_action','true',true);
  update public.bookings set status=target_status where id=booking.id;
  return true;
end $$;
revoke all on function public.staff_update_booking_status(uuid,text) from public,anon;
grant execute on function public.staff_update_booking_status(uuid,text) to authenticated;

create or replace function public.validate_booking_update()
returns trigger language plpgsql security invoker set search_path='' as $$
declare transition_allowed boolean:=false; staff_actor boolean:=false;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')='service_role' or public.is_admin() then return new; end if;
  if new.client_id is distinct from old.client_id or new.provider_id is distinct from old.provider_id
    or new.provider_service_id is distinct from old.provider_service_id or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at or new.location_mode is distinct from old.location_mode
    or new.appointment_address is distinct from old.appointment_address or new.total_amount is distinct from old.total_amount
    or new.currency is distinct from old.currency or new.client_note is distinct from old.client_note then
    raise exception 'Les données contractuelles de la réservation sont immuables';
  end if;
  staff_actor:=current_setting('app.staff_booking_action',true)='true' and exists(
    select 1 from public.collaborators c where c.id=old.collaborator_id and c.profile_id=auth.uid() and c.is_active and c.archived_at is null and 'bookings.manage'=any(c.staff_permissions));
  transition_allowed:=case old.status when 'pending' then new.status in ('confirmed','declined','cancelled_by_client','cancelled_by_provider')
    when 'confirmed' then new.status in ('cancelled_by_client','cancelled_by_provider','in_progress','no_show','disputed')
    when 'in_progress' then new.status in ('completed','disputed') when 'completed' then new.status='disputed'
    when 'no_show' then new.status='disputed' else false end;
  if not transition_allowed then raise exception 'Transition de réservation interdite : % vers %',old.status,new.status; end if;
  if auth.uid()=old.provider_id and new.status=old.status and new.collaborator_id is distinct from old.collaborator_id then return new; end if;
  if staff_actor then
    if not ((old.status='pending' and new.status in ('confirmed','declined')) or (old.status='confirmed' and new.status in ('in_progress','no_show')) or (old.status='in_progress' and new.status='completed')) then raise exception 'Transition de rendez-vous non autorisée au collaborateur' using errcode='42501'; end if;
    return new;
  end if;
  if auth.uid()=old.client_id and new.status not in ('cancelled_by_client','disputed') then raise exception 'Transition non autorisée pour le client'; end if;
  if auth.uid()=old.provider_id and new.status not in ('confirmed','declined','cancelled_by_provider','in_progress','completed','no_show','disputed') then raise exception 'Transition non autorisée pour le prestataire'; end if;
  if auth.uid() not in (old.client_id,old.provider_id) then raise exception 'Modification de réservation interdite'; end if;
  return new;
end $$;

create or replace function messaging_private.guard_message()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not messaging_private.active_account(new.sender_id) or not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and profile_id=new.sender_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  if auth.uid() is not null and auth.uid()<>new.sender_id then raise exception 'Expéditeur invalide' using errcode='42501'; end if;
  if exists(select 1 from public.conversations conv join public.bookings b on b.id=conv.booking_id or b.conversation_id=conv.id
    join public.collaborators c on c.id=b.collaborator_id where conv.id=new.conversation_id and c.profile_id=new.sender_id and c.is_active and c.archived_at is null
      and not 'messages.reply'=any(c.staff_permissions)) then raise exception 'Envoi de message non autorisé' using errcode='42501'; end if;
  if auth.uid() is not null then new.created_at:=clock_timestamp(); new.edited_at:=null; new.deleted_at:=null; end if;
  perform pg_advisory_xact_lock(hashtextextended('message:'||new.sender_id::text,0));
  if (select count(*) from public.messages m where m.sender_id=new.sender_id and m.created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'Envois trop fréquents. Réessayez dans une minute.'; end if;
  if new.message_type<>'text' and current_setting('app.message_enriched',true) is distinct from 'true' then raise exception 'Utilisez le service sécurisé de messagerie' using errcode='42501'; end if;
  if new.message_type='text' and new.metadata<>'{}'::jsonb then raise exception 'Métadonnées non autorisées' using errcode='42501'; end if;
  return new;
end $$;

create or replace function booking_private.sync_employee_conversation_member()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_profile uuid; new_profile uuid;
begin
  if tg_op='UPDATE' then select profile_id into old_profile from public.collaborators where id=old.collaborator_id; end if;
  if new.collaborator_id is not null then
    select c.profile_id into new_profile from public.collaborators c where c.id=new.collaborator_id and c.is_active and c.archived_at is null and ('messages.read'=any(c.staff_permissions) or 'messages.reply'=any(c.staff_permissions));
  end if;
  if old_profile is not null and old_profile is distinct from new_profile then
    delete from public.conversation_members m using public.conversations conv where m.profile_id=old_profile and conv.id=m.conversation_id and (conv.booking_id=new.id or new.conversation_id=conv.id);
  end if;
  if new_profile is not null then
    insert into public.conversation_members(conversation_id,profile_id) select c.id,new_profile from public.conversations c where c.booking_id=new.id or c.id=new.conversation_id on conflict(conversation_id,profile_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists booking_employee_conversation_member on public.bookings;
create trigger booking_employee_conversation_member after insert or update of collaborator_id on public.bookings for each row execute function booking_private.sync_employee_conversation_member();

create or replace function public.owner_update_collaborator_access(target_business_id uuid,target_collaborator_id uuid,target_role text,target_permissions text[]) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.businesses where id=target_business_id and owner_id=auth.uid() and archived_at is null) then raise exception 'Accès propriétaire requis' using errcode='42501'; end if;
  if target_role not in ('manager','reception','member') or coalesce(array_length(target_permissions,1),0)=0
    or not target_permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read','clients.read']::text[]
    or ('bookings.manage'=any(target_permissions) and not 'bookings.read'=any(target_permissions))
    or ('messages.reply'=any(target_permissions) and not 'messages.read'=any(target_permissions)) then raise exception 'Permissions invalides'; end if;
  update public.collaborators set internal_role=target_role,staff_permissions=target_permissions
    where id=target_collaborator_id and business_id=target_business_id and is_active and profile_id is not null;
  if not found then raise exception 'Collaborateur introuvable'; end if;
  if not ('messages.read'=any(target_permissions) or 'messages.reply'=any(target_permissions)) then
    delete from public.conversation_members m using public.conversations conv,public.bookings b,public.collaborators c
    where c.id=target_collaborator_id and conv.id=m.conversation_id and m.profile_id=c.profile_id and (b.id=conv.booking_id or b.conversation_id=conv.id) and b.collaborator_id=c.id;
  end if;
  return true;
end $$;
revoke all on function public.owner_update_collaborator_access(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.owner_update_collaborator_access(uuid,uuid,text,text[]) to authenticated;

-- Keep the dashboard window explicit: every displayed social indicator is
-- calculated from the same 30-day interval, including post interactions.
drop function if exists public.provider_creator_statistics(timestamptz,timestamptz);
create function public.provider_creator_statistics(target_from timestamptz default now()-interval '30 days', target_to timestamptz default now())
returns table(post_id uuid,views bigint,average_watch_ms bigint,completion_rate numeric,likes bigint,comments bigint,saves bigint,shares bigint,new_followers bigint,profile_visits bigint,booking_clicks bigint,bookings bigint,gross_amount bigint)
language sql stable security definer set search_path='' as $$
  select p.id,
    (select count(*) from public.video_views v where v.post_id=p.id and v.created_at>=target_from and v.created_at<target_to),
    coalesce((select avg(v.watched_ms)::bigint from public.video_views v where v.post_id=p.id and v.created_at>=target_from and v.created_at<target_to),0),
    coalesce((select avg(case when v.completed then 100 else 0 end)::numeric(5,2) from public.video_views v where v.post_id=p.id and v.created_at>=target_from and v.created_at<target_to),0),
    (select count(*) from public.post_likes l where l.post_id=p.id and l.created_at>=target_from and l.created_at<target_to),
    (select count(*) from public.post_comments c where c.post_id=p.id and not c.is_hidden and c.created_at>=target_from and c.created_at<target_to),
    (select count(*) from public.post_saves s where s.post_id=p.id and s.created_at>=target_from and s.created_at<target_to),
    (select count(*) from public.post_shares s where s.post_id=p.id and s.created_at>=target_from and s.created_at<target_to),
    (select count(*) from public.follows f where f.source_post_id=p.id and f.created_at>=target_from and f.created_at<target_to),
    (select count(*) from public.social_profile_visits v where v.source_post_id=p.id and v.created_at>=target_from and v.created_at<target_to),
    (select count(*) from public.post_booking_clicks c where c.post_id=p.id and c.created_at>=target_from and c.created_at<target_to),
    (select count(*) from public.bookings b where b.source_post_id=p.id and b.created_at>=target_from and b.created_at<target_to),
    coalesce((select sum(b.total_amount)::bigint from public.bookings b where b.source_post_id=p.id and b.created_at>=target_from and b.created_at<target_to and b.status not in ('declined','cancelled_by_client','cancelled_by_provider')),0)
  from public.posts p where p.author_id=auth.uid() order by p.published_at desc nulls last;
$$;
revoke all on function public.provider_creator_statistics(timestamptz,timestamptz) from public,anon;
grant execute on function public.provider_creator_statistics(timestamptz,timestamptz) to authenticated;

-- A direct owner row update may manage staff role/permissions, but must never
-- bind an arbitrary account to a collaborator without a verified invitation.
create or replace function booking_private.guard_collaborator_profile_link()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.profile_id is not null and current_setting('app.accept_business_invitation',true) is distinct from 'true' then
      raise exception 'Liaison du compte collaborateur réservée à l’acceptation d’invitation' using errcode='42501';
    end if;
  elsif new.profile_id is not null and new.profile_id is distinct from old.profile_id and current_setting('app.accept_business_invitation',true) is distinct from 'true' then
    raise exception 'Liaison du compte collaborateur réservée à l’acceptation d’invitation' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists collaborator_profile_link_guard on public.collaborators;
create trigger collaborator_profile_link_guard before insert on public.collaborators for each row execute function booking_private.guard_collaborator_profile_link();
drop trigger if exists collaborator_profile_link_guard_update on public.collaborators;
create trigger collaborator_profile_link_guard_update before update of profile_id on public.collaborators for each row execute function booking_private.guard_collaborator_profile_link();

create or replace function booking_private.sync_employee_conversations()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.profile_id is not null and new.is_active and new.archived_at is null and exists(
    select 1 from booking_private.collaborator_access a where a.collaborator_id=new.id and a.profile_id=new.profile_id
      and (a.staff_permissions @> array['messages.read']::text[] or a.staff_permissions @> array['messages.reply']::text[])) then
    insert into public.conversation_members(conversation_id,profile_id)
    select distinct conv.id,new.profile_id from public.conversations conv join public.bookings b on b.id=conv.booking_id or b.conversation_id=conv.id
    where b.collaborator_id=new.id on conflict(conversation_id,profile_id) do nothing;
  elsif old.profile_id is not null then
    delete from public.conversation_members m using public.conversations conv,public.bookings b
    where m.profile_id=old.profile_id and conv.id=m.conversation_id and (b.id=conv.booking_id or b.conversation_id=conv.id) and b.collaborator_id=old.id;
  end if;
  return new;
end $$;
drop trigger if exists collaborator_conversation_memberships_sync on public.collaborators;
create trigger collaborator_conversation_memberships_sync after insert or update of profile_id,is_active,archived_at on public.collaborators for each row execute function booking_private.sync_employee_conversations();

-- Keep salon staff permissions and invitation credentials outside the exposed
-- public API schema. booking_private is already excluded from PostgREST.
create schema if not exists booking_private;
revoke all on schema booking_private from public,anon,authenticated;
create table if not exists booking_private.collaborator_access (
  collaborator_id uuid primary key references public.collaborators(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  internal_role text not null default 'member' check (internal_role in ('manager','reception','member')),
  staff_permissions text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (staff_permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read','clients.read']::text[]),
  check (not ('bookings.manage'=any(staff_permissions)) or 'bookings.read'=any(staff_permissions)),
  check (not ('messages.reply'=any(staff_permissions)) or 'messages.read'=any(staff_permissions))
);
create index if not exists collaborator_access_profile_business_idx on booking_private.collaborator_access(profile_id,business_id);
create table if not exists booking_private.business_invitation_secrets (
  invitation_id uuid primary key references public.business_invitations(id) on delete cascade,
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  internal_role text not null check (internal_role in ('manager','reception','member')),
  staff_permissions text[] not null check (staff_permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read','clients.read']::text[]),
  provider_message_id text,
  check (not ('bookings.manage'=any(staff_permissions)) or 'bookings.read'=any(staff_permissions)),
  check (not ('messages.reply'=any(staff_permissions)) or 'messages.read'=any(staff_permissions))
);
create table if not exists booking_private.business_invitation_events (
  id bigint generated always as identity primary key,
  invitation_id uuid,
  business_id uuid not null,
  actor_id uuid,
  event_type text not null check (event_type in ('created','sent','accepted','revoked','expired','collaborator_revoked','left','access_updated')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table booking_private.collaborator_access enable row level security;
alter table booking_private.business_invitation_secrets enable row level security;
alter table booking_private.business_invitation_events enable row level security;
revoke all on all tables in schema booking_private from public,anon,authenticated;

-- Preserve any values from an interrupted earlier application before removing
-- sensitive columns from public tables. Dynamic checks make this migration safe
-- whether the earlier draft was partially applied or remains unapplied.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='collaborators' and column_name='staff_permissions') then
    execute 'insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role,staff_permissions) select id,business_id,profile_id,internal_role,coalesce(staff_permissions,''{}'') from public.collaborators on conflict(collaborator_id) do update set business_id=excluded.business_id,profile_id=excluded.profile_id,internal_role=excluded.internal_role,staff_permissions=excluded.staff_permissions';
  else
    insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role)
    select id,business_id,profile_id,internal_role from public.collaborators on conflict(collaborator_id) do nothing;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_invitations' and column_name='staff_permissions') then
    execute 'insert into booking_private.business_invitation_secrets(invitation_id,token_hash,internal_role,staff_permissions,provider_message_id) select id,token_hash,internal_role,coalesce(staff_permissions,''{}''),provider_message_id from public.business_invitations on conflict(invitation_id) do update set token_hash=excluded.token_hash,internal_role=excluded.internal_role,staff_permissions=excluded.staff_permissions,provider_message_id=excluded.provider_message_id';
  end if;
end $$;
insert into booking_private.business_invitation_secrets(invitation_id,internal_role,staff_permissions)
select i.id,i.internal_role,'{}'::text[] from public.business_invitations i
on conflict(invitation_id) do nothing;

drop policy if exists "assigned active staff read bookings" on public.bookings;
drop policy if exists "staff read only assigned client profiles" on public.profiles;
drop trigger if exists collaborator_conversation_memberships_sync on public.collaborators;
drop trigger if exists booking_employee_conversation_member on public.bookings;

create or replace function public.current_collaborator_access()
returns table(business_id uuid,collaborator_id uuid,internal_role text,staff_permissions text[])
language sql stable security definer set search_path='' as $$
  select a.business_id,a.collaborator_id,a.internal_role,a.staff_permissions
  from booking_private.collaborator_access a join public.collaborators c on c.id=a.collaborator_id
    join public.businesses b on b.id=a.business_id
  where a.profile_id=auth.uid() and auth.uid() is not null and c.is_active and c.archived_at is null
    and b.is_active and b.archived_at is null and b.status='approved'
$$;
revoke all on function public.current_collaborator_access() from public,anon;
grant execute on function public.current_collaborator_access() to authenticated;

create or replace function public.owner_list_collaborator_access(target_business_id uuid)
returns table(collaborator_id uuid,internal_role text,staff_permissions text[],has_profile boolean)
language sql stable security definer set search_path='' as $$
  select a.collaborator_id,a.internal_role,a.staff_permissions,(a.profile_id is not null)
  from booking_private.collaborator_access a join public.businesses b on b.id=a.business_id
  where a.business_id=target_business_id and b.owner_id=auth.uid() and auth.uid() is not null
$$;
revoke all on function public.owner_list_collaborator_access(uuid) from public,anon;
grant execute on function public.owner_list_collaborator_access(uuid) to authenticated;

create or replace function public.collaborator_has_permission(target_business_id uuid,target_collaborator_id uuid,target_permission text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from booking_private.collaborator_access a join public.collaborators c on c.id=a.collaborator_id
      join public.businesses b on b.id=a.business_id
    where a.business_id=target_business_id and a.collaborator_id=target_collaborator_id and a.profile_id=auth.uid()
      and c.is_active and c.archived_at is null and b.is_active and b.archived_at is null and b.status='approved'
      and target_permission=any(a.staff_permissions))
$$;
revoke all on function public.collaborator_has_permission(uuid,uuid,text) from public,anon;
grant execute on function public.collaborator_has_permission(uuid,uuid,text) to authenticated;

create policy "assigned active staff read bookings" on public.bookings for select to authenticated using (
  public.collaborator_has_permission(business_id,collaborator_id,'bookings.read'));
create policy "staff read only assigned client profiles" on public.profiles for select to authenticated using (
  exists(select 1 from public.bookings b where b.client_id=profiles.id and public.collaborator_has_permission(b.business_id,b.collaborator_id,'clients.read')));
-- Reset legacy table-wide ACLs (RLS alone cannot hide columns or prevent
-- table-level operations). Keep the existing row policies, then restore only
-- the public presentation fields and explicitly permitted owner updates.
revoke all on public.collaborators from public,anon,authenticated;
grant select(id,business_id,display_name,title,avatar_url,is_bookable,is_active,created_at,updated_at,archived_at,first_name,public_last_name,specialties,buffer_minutes) on public.collaborators to anon,authenticated;
grant update(display_name,title,avatar_url,is_bookable,is_active,archived_at,first_name,public_last_name,specialties,buffer_minutes) on public.collaborators to authenticated;

alter table public.collaborators drop constraint if exists collaborators_staff_permissions_check;
alter table public.business_invitations drop constraint if exists business_invitations_staff_permissions_check;
alter table public.collaborators drop column if exists staff_permissions;
alter table public.business_invitations drop column if exists staff_permissions;
alter table public.business_invitations drop column if exists token_hash;
alter table public.business_invitations drop column if exists provider_message_id;

create or replace function public.create_business_invitation(target_business_id uuid,target_email text,target_role text,target_permissions text[],target_token_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; normalized_email text:=lower(trim(target_email));
begin
  if auth.uid() is null or not exists(select 1 from public.businesses b join public.profiles p on p.id=b.owner_id where b.id=target_business_id and b.owner_id=auth.uid() and b.archived_at is null and b.is_active and not p.is_suspended and p.account_status='active') then raise exception 'Accès propriétaire requis' using errcode='42501'; end if;
  if normalized_email is null or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(normalized_email)>254 then raise exception 'Adresse e-mail invalide'; end if;
  if target_role is null or target_role not in ('manager','reception','member') or target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' or coalesce(array_length(target_permissions,1),0)=0 or not target_permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read','clients.read']::text[] or ('bookings.manage'=any(target_permissions) and not 'bookings.read'=any(target_permissions)) or ('messages.reply'=any(target_permissions) and not 'messages.read'=any(target_permissions)) then raise exception 'Rôle, jeton ou permissions invalides'; end if;
  insert into booking_private.business_invitation_events(invitation_id,business_id,actor_id,event_type)
  select id,business_id,auth.uid(),'expired' from public.business_invitations
  where business_id=target_business_id and email=normalized_email and status='pending' and expires_at<=now();
  update booking_private.business_invitation_secrets set token_hash=null where invitation_id in (select id from public.business_invitations where business_id=target_business_id and email=normalized_email and status='pending' and expires_at<=now());
  update public.business_invitations set status='expired' where business_id=target_business_id and email=normalized_email and status='pending' and expires_at<=now();
  if (select count(*) from public.business_invitations where business_id=target_business_id and invited_by=auth.uid() and created_at>now()-interval '24 hours')>=25 then raise exception 'Limite quotidienne d’invitations atteinte' using errcode='54000'; end if;
  if exists(select 1 from public.collaborators c join auth.users u on u.id=c.profile_id where c.business_id=target_business_id and lower(u.email)=normalized_email and c.is_active) then raise exception 'Cette personne fait déjà partie du salon'; end if;
  insert into public.business_invitations(business_id,email,internal_role,invited_by,expires_at,status) values(target_business_id,normalized_email,target_role,auth.uid(),now()+interval '48 hours','pending') returning id into result;
  insert into booking_private.business_invitation_secrets(invitation_id,token_hash,internal_role,staff_permissions) values(result,target_token_hash,target_role,target_permissions);
  insert into booking_private.business_invitation_events(invitation_id,business_id,actor_id,event_type) values(result,target_business_id,auth.uid(),'created');
  return result;
end $$;
revoke all on function public.create_business_invitation(uuid,text,text,text[],text) from public,anon;
grant execute on function public.create_business_invitation(uuid,text,text,text[],text) to authenticated;

create or replace function public.lookup_business_invitation(target_token_hash text)
returns table(id uuid,email text,expires_at timestamptz,status text)
language sql stable security definer set search_path='' as $$
  select i.id,i.email,i.expires_at,i.status from public.business_invitations i join booking_private.business_invitation_secrets s on s.invitation_id=i.id
  where s.token_hash=target_token_hash and target_token_hash ~ '^[0-9a-f]{64}$' and i.status='pending' and i.expires_at>now()
$$;
revoke all on function public.lookup_business_invitation(text) from public,anon,authenticated;
grant execute on function public.lookup_business_invitation(text) to service_role;

create or replace function public.mark_business_invitation_sent(target_invitation_id uuid,target_provider_message_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' or target_provider_message_id is null or char_length(target_provider_message_id)>255 then raise exception 'Service serveur requis' using errcode='42501'; end if;
  update booking_private.business_invitation_secrets set provider_message_id=target_provider_message_id where invitation_id=target_invitation_id and exists(select 1 from public.business_invitations i where i.id=target_invitation_id and i.status='pending');
  if not found then raise exception 'Invitation indisponible'; end if;
  update public.business_invitations set sent_at=now() where id=target_invitation_id and status='pending';
  insert into booking_private.business_invitation_events(invitation_id,business_id,actor_id,event_type) select id,business_id,null,'sent' from public.business_invitations where id=target_invitation_id;
  return true;
end $$;
revoke all on function public.mark_business_invitation_sent(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_business_invitation_sent(uuid,text) to service_role;

create or replace function public.revoke_business_invitation(target_invitation_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare business uuid;
begin
  update public.business_invitations i set status='revoked',revoked_at=now() from public.businesses b where i.id=target_invitation_id and i.business_id=b.id and b.owner_id=auth.uid() and i.status='pending' returning i.business_id into business;
  if business is null then raise exception 'Invitation indisponible' using errcode='42501'; end if;
  update booking_private.business_invitation_secrets set token_hash=null where invitation_id=target_invitation_id;
  insert into booking_private.business_invitation_events(invitation_id,business_id,actor_id,event_type) values(target_invitation_id,business,auth.uid(),'revoked');
  return true;
end $$;
revoke all on function public.revoke_business_invitation(uuid) from public,anon;
grant execute on function public.revoke_business_invitation(uuid) to authenticated;

create or replace function public.accept_business_invitation(target_invitation_id uuid,target_token_hash text,target_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.business_invitations%rowtype; secret booking_private.business_invitation_secrets%rowtype; person public.profiles%rowtype; member_id uuid; member_name text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service serveur requis' using errcode='42501'; end if;
  select * into invitation from public.business_invitations where id=target_invitation_id for update;
  select * into secret from booking_private.business_invitation_secrets where invitation_id=target_invitation_id for update;
  if invitation.id is null or invitation.status<>'pending' or invitation.expires_at<=now() or secret.token_hash is distinct from target_token_hash or target_token_hash !~ '^[0-9a-f]{64}$' or not exists(select 1 from auth.users u where u.id=target_user_id and lower(u.email)=invitation.email and u.email_confirmed_at is not null) then raise exception 'Invitation invalide, expirée ou adresse différente' using errcode='42501'; end if;
  select * into person from public.profiles where id=target_user_id and not is_suspended and account_status='active';
  if person.id is null then raise exception 'Compte inactif' using errcode='42501'; end if;
  member_name:=coalesce(nullif(trim(coalesce(person.first_name,'')||' '||coalesce(person.last_name,'')),''),nullif(person.display_name,''),'Collaborateur');
  perform set_config('app.accept_business_invitation','true',true);
  insert into public.collaborators(business_id,profile_id,display_name,first_name,public_last_name,is_active,is_bookable)
  values(invitation.business_id,target_user_id,member_name,person.first_name,person.last_name,true,false)
  on conflict(business_id,profile_id) do update set display_name=excluded.display_name,is_active=true,archived_at=null returning id into member_id;
  insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role,staff_permissions)
  values(member_id,invitation.business_id,target_user_id,secret.internal_role,secret.staff_permissions)
  on conflict(collaborator_id) do update set profile_id=excluded.profile_id,internal_role=excluded.internal_role,staff_permissions=excluded.staff_permissions,updated_at=now();
  update public.business_invitations set status='accepted',accepted_at=now(),accepted_by=target_user_id,collaborator_id=member_id where id=target_invitation_id;
  update booking_private.business_invitation_secrets set token_hash=null where invitation_id=target_invitation_id;
  insert into booking_private.business_invitation_events(invitation_id,business_id,actor_id,event_type) values(invitation.id,invitation.business_id,target_user_id,'accepted');
  insert into public.notifications(profile_id,kind,title,body,data) values(invitation.invited_by,'team_invitation','Invitation acceptée',member_name||' a rejoint votre salon.',jsonb_build_object('business_id',invitation.business_id,'href','/salon/team'));
  return jsonb_build_object('collaborator_id',member_id,'business_id',invitation.business_id,'business_name',(select name from public.businesses where id=invitation.business_id));
end $$;
revoke all on function public.accept_business_invitation(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.accept_business_invitation(uuid,text,uuid) to service_role;

create or replace function public.owner_update_collaborator_access(target_business_id uuid,target_collaborator_id uuid,target_role text,target_permissions text[]) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.businesses where id=target_business_id and owner_id=auth.uid() and archived_at is null) then raise exception 'Accès propriétaire requis' using errcode='42501'; end if;
  if target_role not in ('manager','reception','member') or coalesce(array_length(target_permissions,1),0)=0 or not target_permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read','clients.read']::text[] or ('bookings.manage'=any(target_permissions) and not 'bookings.read'=any(target_permissions)) or ('messages.reply'=any(target_permissions) and not 'messages.read'=any(target_permissions)) then raise exception 'Permissions invalides'; end if;
  update booking_private.collaborator_access set internal_role=target_role,staff_permissions=target_permissions,updated_at=now() where collaborator_id=target_collaborator_id and business_id=target_business_id and profile_id is not null and exists(select 1 from public.collaborators c where c.id=target_collaborator_id and c.is_active);
  if not found then raise exception 'Collaborateur introuvable'; end if;
  insert into booking_private.business_invitation_events(invitation_id,business_id,actor_id,event_type,details) values(null,target_business_id,auth.uid(),'access_updated',jsonb_build_object('collaborator_id',target_collaborator_id,'role',target_role));
  return true;
end $$;
revoke all on function public.owner_update_collaborator_access(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.owner_update_collaborator_access(uuid,uuid,text,text[]) to authenticated;

create or replace function public.revoke_business_collaborator(target_business_id uuid,target_collaborator_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare employee public.collaborators%rowtype; future_count integer;
begin
  if not exists(select 1 from public.businesses where id=target_business_id and owner_id=auth.uid() and archived_at is null) then raise exception 'Accès propriétaire requis' using errcode='42501'; end if;
  select * into employee from public.collaborators where id=target_collaborator_id and business_id=target_business_id and is_active for update;
  if employee.id is null then raise exception 'Collaborateur indisponible'; end if;
  select count(*) into future_count from public.bookings where collaborator_id=employee.id and starts_at>now() and status in ('pending','confirmed');
  delete from public.conversation_members m using public.conversations c,public.bookings b where m.profile_id=employee.profile_id and c.id=m.conversation_id and (b.id=c.booking_id or b.conversation_id=c.id) and b.collaborator_id=employee.id;
  update booking_private.collaborator_access set profile_id=null,internal_role='member',staff_permissions='{}',updated_at=now() where collaborator_id=employee.id;
  update public.collaborators set profile_id=null,is_active=false,is_bookable=false where id=employee.id;
  if future_count>0 then insert into public.notifications(profile_id,kind,title,body,data) values(auth.uid(),'team_availability','Réaffectation à vérifier',future_count||' rendez-vous attribué(s) à cet employé doivent être réaffectés.',jsonb_build_object('business_id',target_business_id,'href','/salon/agenda')); end if;
  insert into booking_private.business_invitation_events(invitation_id,business_id,actor_id,event_type,details) values(null,target_business_id,auth.uid(),'collaborator_revoked',jsonb_build_object('collaborator_id',employee.id));
  return true;
end $$;
revoke all on function public.revoke_business_collaborator(uuid,uuid) from public,anon;
grant execute on function public.revoke_business_collaborator(uuid,uuid) to authenticated;

create or replace function public.leave_business(target_business_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare employee public.collaborators%rowtype;
begin
  select c.* into employee from public.collaborators c join booking_private.collaborator_access a on a.collaborator_id=c.id where c.business_id=target_business_id and a.profile_id=auth.uid() and c.is_active for update of c;
  if employee.id is null then raise exception 'Accès collaborateur introuvable' using errcode='42501'; end if;
  delete from public.conversation_members m using public.conversations c,public.bookings b where m.profile_id=auth.uid() and c.id=m.conversation_id and (b.id=c.booking_id or b.conversation_id=c.id) and b.collaborator_id=employee.id;
  update booking_private.collaborator_access set profile_id=null,internal_role='member',staff_permissions='{}',updated_at=now() where collaborator_id=employee.id;
  update public.collaborators set profile_id=null,is_active=false,is_bookable=false where id=employee.id;
  insert into public.notifications(profile_id,kind,title,body,data) select b.owner_id,'team_availability','Un collaborateur a quitté le salon',employee.display_name||' a quitté l’équipe. Vérifiez ses rendez-vous futurs.',jsonb_build_object('business_id',b.id,'href','/salon/team') from public.businesses b where b.id=target_business_id;
  insert into booking_private.business_invitation_events(invitation_id,business_id,actor_id,event_type,details) values(null,target_business_id,auth.uid(),'left',jsonb_build_object('collaborator_id',employee.id));
  return true;
end $$;
revoke all on function public.leave_business(uuid) from public,anon;
grant execute on function public.leave_business(uuid) to authenticated;

create or replace function public.staff_update_booking_status(target_booking_id uuid,target_status text) returns boolean
language plpgsql security definer set search_path='' as $$
declare booking public.bookings%rowtype;
begin
  if auth.uid() is null or target_status not in ('confirmed','declined','in_progress','completed','no_show') then raise exception 'Action non autorisée' using errcode='42501'; end if;
  select b.* into booking from public.bookings b join booking_private.collaborator_access a on a.collaborator_id=b.collaborator_id join public.collaborators c on c.id=a.collaborator_id where b.id=target_booking_id and a.profile_id=auth.uid() and c.is_active and c.archived_at is null and 'bookings.manage'=any(a.staff_permissions) for update of b;
  if booking.id is null then raise exception 'Rendez-vous inaccessible' using errcode='42501'; end if;
  if not ((booking.status='pending' and target_status in ('confirmed','declined')) or (booking.status='confirmed' and target_status in ('in_progress','no_show')) or (booking.status='in_progress' and target_status='completed')) then raise exception 'Transition de rendez-vous invalide'; end if;
  perform set_config('app.staff_booking_action','true',true);
  update public.bookings set status=target_status where id=booking.id;
  return true;
end $$;
revoke all on function public.staff_update_booking_status(uuid,text) from public,anon;
grant execute on function public.staff_update_booking_status(uuid,text) to authenticated;

create or replace function public.validate_booking_update() returns trigger language plpgsql security invoker set search_path='' as $$
declare transition_allowed boolean:=false; staff_actor boolean:=false;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')='service_role' or public.is_admin() then return new; end if;
  if new.client_id is distinct from old.client_id or new.provider_id is distinct from old.provider_id or new.provider_service_id is distinct from old.provider_service_id or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.location_mode is distinct from old.location_mode or new.appointment_address is distinct from old.appointment_address or new.total_amount is distinct from old.total_amount or new.currency is distinct from old.currency or new.client_note is distinct from old.client_note then raise exception 'Les données contractuelles de la réservation sont immuables'; end if;
  staff_actor:=current_setting('app.staff_booking_action',true)='true' and exists(select 1 from booking_private.collaborator_access a join public.collaborators c on c.id=a.collaborator_id where c.id=old.collaborator_id and a.profile_id=auth.uid() and c.is_active and c.archived_at is null and 'bookings.manage'=any(a.staff_permissions));
  transition_allowed:=case old.status when 'pending' then new.status in ('confirmed','declined','cancelled_by_client','cancelled_by_provider') when 'confirmed' then new.status in ('cancelled_by_client','cancelled_by_provider','in_progress','no_show','disputed') when 'in_progress' then new.status in ('completed','disputed') when 'completed' then new.status='disputed' when 'no_show' then new.status='disputed' else false end;
  if not transition_allowed then raise exception 'Transition de réservation interdite : % vers %',old.status,new.status; end if;
  if auth.uid()=old.provider_id and new.status=old.status and new.collaborator_id is distinct from old.collaborator_id then return new; end if;
  if staff_actor then if not ((old.status='pending' and new.status in ('confirmed','declined')) or (old.status='confirmed' and new.status in ('in_progress','no_show')) or (old.status='in_progress' and new.status='completed')) then raise exception 'Transition de rendez-vous non autorisée au collaborateur' using errcode='42501'; end if; return new; end if;
  if auth.uid()=old.client_id and new.status not in ('cancelled_by_client','disputed') then raise exception 'Transition non autorisée pour le client'; end if;
  if auth.uid()=old.provider_id and new.status not in ('confirmed','declined','cancelled_by_provider','in_progress','completed','no_show','disputed') then raise exception 'Transition non autorisée pour le prestataire'; end if;
  if auth.uid() not in (old.client_id,old.provider_id) then raise exception 'Modification de réservation interdite'; end if;
  return new;
end $$;

create or replace function messaging_private.guard_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not messaging_private.active_account(new.sender_id) or not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and profile_id=new.sender_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  if auth.uid() is not null and auth.uid()<>new.sender_id then raise exception 'Expéditeur invalide' using errcode='42501'; end if;
  if exists(select 1 from public.conversations conv join public.bookings b on b.id=conv.booking_id or b.conversation_id=conv.id join booking_private.collaborator_access a on a.collaborator_id=b.collaborator_id where conv.id=new.conversation_id and a.profile_id=new.sender_id and not 'messages.reply'=any(a.staff_permissions)) then raise exception 'Envoi de message non autorisé' using errcode='42501'; end if;
  if auth.uid() is not null then new.created_at:=clock_timestamp(); new.edited_at:=null; new.deleted_at:=null; end if;
  perform pg_advisory_xact_lock(hashtextextended('message:'||new.sender_id::text,0));
  if (select count(*) from public.messages m where m.sender_id=new.sender_id and m.created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'Envois trop fréquents. Réessayez dans une minute.'; end if;
  if new.message_type<>'text' and current_setting('app.message_enriched',true) is distinct from 'true' then raise exception 'Utilisez le service sécurisé de messagerie' using errcode='42501'; end if;
  if new.message_type='text' and new.metadata<>'{}'::jsonb then raise exception 'Métadonnées non autorisées' using errcode='42501'; end if;
  return new;
end $$;

create or replace function booking_private.sync_employee_conversation_member() returns trigger language plpgsql security definer set search_path='' as $$
declare old_profile uuid; new_profile uuid;
begin
  if tg_op='UPDATE' then select profile_id into old_profile from booking_private.collaborator_access where collaborator_id=old.collaborator_id; end if;
  if new.collaborator_id is not null then select a.profile_id into new_profile from booking_private.collaborator_access a join public.collaborators c on c.id=a.collaborator_id where a.collaborator_id=new.collaborator_id and c.is_active and c.archived_at is null and ('messages.read'=any(a.staff_permissions) or 'messages.reply'=any(a.staff_permissions)); end if;
  if old_profile is not null and old_profile is distinct from new_profile then delete from public.conversation_members m using public.conversations conv where m.profile_id=old_profile and conv.id=m.conversation_id and (conv.booking_id=new.id or new.conversation_id=conv.id); end if;
  if new_profile is not null then insert into public.conversation_members(conversation_id,profile_id) select c.id,new_profile from public.conversations c where c.booking_id=new.id or c.id=new.conversation_id on conflict(conversation_id,profile_id) do nothing; end if;
  return new;
end $$;
create trigger booking_employee_conversation_member after insert or update of collaborator_id on public.bookings for each row execute function booking_private.sync_employee_conversation_member();
create trigger collaborator_conversation_memberships_sync after insert or update of profile_id,is_active,archived_at on public.collaborators for each row execute function booking_private.sync_employee_conversations();

-- The public invitation row contains only owner-readable workflow metadata.
revoke all on public.business_invitations from public,anon,authenticated;
grant select(id,business_id,email,internal_role,status,invited_by,expires_at,accepted_at,accepted_by,collaborator_id,revoked_at,sent_at,created_at) on public.business_invitations to authenticated;

alter table public.collaborators drop column if exists internal_role;
notify pgrst,'reload schema';
commit;
