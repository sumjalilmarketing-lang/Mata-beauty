begin;
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
 insert into public.collaborators(business_id,profile_id,display_name,title,internal_role,is_active,is_bookable)
 values(invitation.business_id,claim.profile_id,left(actor_name,100),'Équipe du salon',invitation.internal_role,true,false)
 on conflict(business_id,profile_id) do update set internal_role=excluded.internal_role,is_active=true,archived_at=null,updated_at=now() returning id into selected_collaborator;
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
create or replace function public.respond_business_invitation(target_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.business_invitations%rowtype; claim uuid; collaborator uuid;
begin
 if auth.uid() is null or target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invitation invalide' using errcode='42501'; end if;
 select i.* into invitation from public.business_invitations i join booking_private.business_invitation_secrets s on s.invitation_id=i.id where s.token_hash=target_token_hash for update of i;
 if invitation.id is null or invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'Invitation invalide ou expirée' using errcode='42501'; end if;
 if invitation.recipient_phone is null then
  collaborator:=public.accept_business_invitation(target_token_hash);
  return jsonb_build_object('state','accepted','collaboratorId',collaborator);
 end if;
 if auth.uid()=invitation.invited_by then return jsonb_build_object('state','owner'); end if; if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.account_status='active' and not p.is_suspended and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)) then raise exception 'Compte actif et confirmé requis' using errcode='42501'; end if;
 select id into claim from booking_private.phone_invitation_claims where invitation_id=invitation.id and profile_id=auth.uid() and status='pending';
 if claim is not null then collaborator:=booking_private.activate_link_invitation(claim,true); return jsonb_build_object('state','accepted','collaboratorId',collaborator); end if;
 if exists(select 1 from booking_private.phone_invitation_claims where invitation_id=invitation.id and profile_id=auth.uid()) then raise exception 'Demande déjà traitée'; end if;
 if (select count(*) from booking_private.phone_invitation_claims where invitation_id=invitation.id)>=10 then raise exception 'Contactez le responsable du salon'; end if;
 insert into booking_private.phone_invitation_claims(invitation_id,profile_id) values(invitation.id,auth.uid()) returning id into claim;
 collaborator:=booking_private.activate_link_invitation(claim,true);
 return jsonb_build_object('state','accepted','collaboratorId',collaborator);
end; $$;
revoke all on function public.respond_business_invitation(text) from public,anon;
grant execute on function public.respond_business_invitation(text) to authenticated;
-- Only the salon name is exposed to someone holding the personal invitation secret.
create or replace function public.preview_business_invitation(target_token_hash text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('salonName',b.name) from public.business_invitations i
 join booking_private.business_invitation_secrets s on s.invitation_id=i.id
 join public.businesses b on b.id=i.business_id
 where target_token_hash ~ '^[0-9a-f]{64}$' and s.token_hash=target_token_hash and i.status='pending' and i.expires_at>now();
$$;
revoke all on function public.preview_business_invitation(text) from public;
grant execute on function public.preview_business_invitation(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
