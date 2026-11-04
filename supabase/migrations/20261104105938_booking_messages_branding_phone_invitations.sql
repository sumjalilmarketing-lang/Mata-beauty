begin;
-- Qualify the outer message: bookings.conversation_id is a nullable legacy column.
drop policy if exists "messages participant or authorized salon staff insert" on public.messages;
create policy "messages participant or authorized salon staff insert" on public.messages for insert to authenticated
with check (sender_id=auth.uid() and public.is_conversation_member(messages.conversation_id) and exists(
 select 1 from public.conversations cv left join public.bookings b on b.id=cv.booking_id
 where cv.id=messages.conversation_id and (b.id is null or auth.uid() in (b.client_id,b.provider_id)
 or (b.collaborator_id is not null and booking_private.active_staff_permission(auth.uid(),b.collaborator_id,'messages.reply')))));
alter table public.provider_profiles add column if not exists logo_url text;
-- Preserve the logo already chosen by the owner without publishing a draft salon.
update public.provider_profiles p set logo_url=(select b.logo_url from public.businesses b where b.owner_id=p.profile_id and b.archived_at is null and b.logo_url is not null order by b.created_at,b.id limit 1) where p.logo_url is null;
create or replace function public.set_salon_brand_image(target_business_id uuid,target_kind text,target_url text)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 if auth.uid() is null or not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if target_kind not in ('logo','cover') or target_kind is null or target_url is null or char_length(target_url)>2048
 or target_url !~ '^https://[^/?#]+/storage/v1/object/public/business-media/' or position('/storage/v1/object/public/business-media/'||target_business_id::text||'/' in target_url)=0 then raise exception 'Image du salon invalide'; end if;
 select owner_id into owner from public.businesses where id=target_business_id;
 if target_kind='logo' then
  update public.businesses set logo_url=target_url where id=target_business_id;
  update public.provider_profiles set logo_url=target_url where profile_id=owner;
 else update public.businesses set cover_url=target_url where id=target_business_id;
 end if;
 return target_business_id;
end; $$;
revoke all on function public.set_salon_brand_image(uuid,text,text) from public,anon;
grant execute on function public.set_salon_brand_image(uuid,text,text) to authenticated;

alter table public.business_invitations alter column email drop not null;
alter table public.business_invitations add column recipient_phone text;
alter table public.business_invitations add constraint business_invitation_recipient_check check(
 (email is not null and recipient_phone is null) or (email is null and recipient_phone is not null and recipient_phone ~ '^\+[1-9][0-9]{7,14}$'));
create unique index business_invitations_pending_phone_idx on public.business_invitations(business_id,recipient_phone) where status='pending' and recipient_phone is not null;
create table booking_private.phone_invitation_claims (
 id uuid primary key default gen_random_uuid(),invitation_id uuid not null references public.business_invitations(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),decided_at timestamptz,unique(invitation_id,profile_id));
alter table booking_private.phone_invitation_claims enable row level security;
revoke all on booking_private.phone_invitation_claims from public,anon,authenticated;
create or replace function public.create_business_phone_invitation(target_business_id uuid,target_phone text,target_role text,target_permissions text[],target_token_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation_id uuid; normalized_phone text:=trim(target_phone);
begin
  if auth.uid() is null or not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if normalized_phone is null or normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Numéro international invalide'; end if;
  if target_role is null or target_role not in ('manager','reception','member') then raise exception 'Rôle invalide'; end if;
  if target_token_hash is null or target_token_hash !~ '^[0-9a-f]{64}$' or target_permissions is null
    or cardinality(target_permissions) not between 1 and 5 or array_position(target_permissions,null) is not null
    or cardinality(target_permissions)<>(select count(distinct permission) from unnest(target_permissions) as item(permission))
    or not(target_permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read']::text[])
    or ('bookings.manage'=any(target_permissions) and not 'bookings.read'=any(target_permissions))
    or ('messages.reply'=any(target_permissions) and not 'messages.read'=any(target_permissions)) then raise exception 'Permissions invalides'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_business_id::text,62014));
  if (select count(*) from public.business_invitations i where i.business_id=target_business_id and i.invited_by=auth.uid() and i.created_at>now()-interval '1 hour')>=10 then raise exception 'Trop d’invitations ; réessayez plus tard' using errcode='P0001'; end if;
  with expired as (
    update public.business_invitations set status='expired'
    where business_id=target_business_id and recipient_phone=normalized_phone and status='pending' and expires_at<=now()
    returning id
  ) delete from booking_private.business_invitation_secrets s using expired e where s.invitation_id=e.id;
  if exists(select 1 from public.business_invitations i where i.business_id=target_business_id and i.recipient_phone=normalized_phone and i.status='pending' and i.expires_at>now()) then raise exception 'Une invitation en attente existe déjà'; end if;
  insert into public.business_invitations(business_id,recipient_phone,internal_role,status,invited_by,expires_at)
    values(target_business_id,normalized_phone,target_role,'pending',auth.uid(),now()+interval '48 hours') returning id into invitation_id;
  insert into booking_private.business_invitation_secrets(invitation_id,token_hash,permissions) values(invitation_id,target_token_hash,target_permissions);
  insert into booking_private.business_invitation_events(business_id,invitation_id,actor_id,event_type,details)
    values(target_business_id,invitation_id,auth.uid(),'invited',jsonb_build_object('role',target_role,'permissions',target_permissions));
  return invitation_id;
end;
$$;
revoke all on function public.create_business_phone_invitation(uuid,text,text,text[],text) from public,anon;
grant execute on function public.create_business_phone_invitation(uuid,text,text,text[],text) to authenticated;

create or replace function public.accept_business_invitation(target_token_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.business_invitations%rowtype; permissions text[]; actor_email text; actor_name text; selected_collaborator uuid;
begin
  if auth.uid() is null or target_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invitation invalide' using errcode='42501'; end if;
  select lower(u.email) into actor_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
  if actor_email is null then raise exception 'Confirmez votre adresse e-mail avant d’accepter'; end if;
  select i.* into invitation from public.business_invitations i
    join booking_private.business_invitation_secrets s on s.invitation_id=i.id
    where s.token_hash=target_token_hash for update of i,s;
  if invitation.id is null or invitation.status<>'pending' or invitation.expires_at<=now() or invitation.email is null or invitation.email<>actor_email then raise exception 'Invitation invalide, expirée ou destinée à une autre adresse' using errcode='42501'; end if;
  select s.permissions into permissions from booking_private.business_invitation_secrets s where s.invitation_id=invitation.id;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and not p.is_suspended) then raise exception 'Compte actif requis' using errcode='42501'; end if;
  select coalesce(nullif(trim(p.display_name),''),split_part(actor_email,'@',1)) into actor_name from public.profiles p where p.id=auth.uid();
  insert into public.collaborators(business_id,profile_id,display_name,title,internal_role,is_active,is_bookable)
    values(invitation.business_id,auth.uid(),left(actor_name,100),'Équipe du salon',invitation.internal_role,true,false)
    on conflict (business_id,profile_id) do update set internal_role=excluded.internal_role,is_active=true,archived_at=null,updated_at=now()
    returning id into selected_collaborator;
  insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role,permissions,granted_by,revoked_at)
    values(selected_collaborator,invitation.business_id,auth.uid(),invitation.internal_role,permissions,invitation.invited_by,null)
    on conflict (collaborator_id) do update set internal_role=excluded.internal_role,permissions=excluded.permissions,granted_by=excluded.granted_by,revoked_at=null,updated_at=now();
  update public.business_invitations set status='accepted',accepted_at=now(),accepted_by=auth.uid(),collaborator_id=selected_collaborator where id=invitation.id;
  delete from booking_private.business_invitation_secrets where invitation_id=invitation.id;
  insert into booking_private.business_invitation_events(business_id,invitation_id,collaborator_id,actor_id,event_type,details)
    values(invitation.business_id,invitation.id,selected_collaborator,auth.uid(),'accepted',jsonb_build_object('role',invitation.internal_role,'permissions',permissions));
  insert into public.notifications(profile_id,kind,title,body,data)
    select b.owner_id,'salon_collaborator','Invitation acceptée',actor_name||' a rejoint votre équipe.',jsonb_build_object('business_id',b.id,'href','/salon/team')
    from public.businesses b where b.id=invitation.business_id;
  return selected_collaborator;
end;
$$;
revoke all on function public.accept_business_invitation(text) from public,anon;
grant execute on function public.accept_business_invitation(text) to authenticated;

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
 if auth.uid()=invitation.invited_by or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.account_status='active' and not p.is_suspended and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)) then raise exception 'Compte actif et confirmé requis' using errcode='42501'; end if;
 select id into claim from booking_private.phone_invitation_claims where invitation_id=invitation.id and profile_id=auth.uid() and status='pending';
 if claim is not null then return jsonb_build_object('state','pending_approval'); end if;
 if exists(select 1 from booking_private.phone_invitation_claims where invitation_id=invitation.id and profile_id=auth.uid()) then raise exception 'Demande déjà traitée'; end if;
 if (select count(*) from booking_private.phone_invitation_claims where invitation_id=invitation.id)>=10 then raise exception 'Contactez le responsable du salon'; end if;
 insert into booking_private.phone_invitation_claims(invitation_id,profile_id) values(invitation.id,auth.uid()) returning id into claim;
 insert into public.notifications(profile_id,kind,title,body,data) select b.owner_id,'salon_collaborator','Demande pour rejoindre votre équipe','Un compte a répondu à votre invitation WhatsApp. Confirmez son identité avant d’activer ses accès.',jsonb_build_object('business_id',b.id,'href','/salon/team') from public.businesses b where b.id=invitation.business_id;
 return jsonb_build_object('state','pending_approval');
end; $$;
revoke all on function public.respond_business_invitation(text) from public,anon;
grant execute on function public.respond_business_invitation(text) to authenticated;

create or replace function public.owner_list_business_phone_invitations(target_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',null,'phone',i.recipient_phone,'internal_role',i.internal_role,'status',i.status,'expires_at',i.expires_at,'created_at',i.created_at,'accepted_at',i.accepted_at,'sent_at',null,'claims',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'display_name',coalesce(nullif(p.display_name,''),'Compte Mata Beauty'),'email',u.email,'status',c.status) order by c.created_at) from booking_private.phone_invitation_claims c join public.profiles p on p.id=c.profile_id join auth.users u on u.id=c.profile_id where c.invitation_id=i.id),'[]'::jsonb)) order by i.created_at desc) from public.business_invitations i where i.business_id=target_business_id and i.recipient_phone is not null),'[]'::jsonb);
end; $$;
revoke all on function public.owner_list_business_phone_invitations(uuid) from public,anon;
grant execute on function public.owner_list_business_phone_invitations(uuid) to authenticated;

create or replace function public.review_business_phone_invitation(target_claim_id uuid,approve boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare claim booking_private.phone_invitation_claims%rowtype; invitation public.business_invitations%rowtype; permissions text[]; selected_collaborator uuid; actor_name text;
begin
 if auth.uid() is null or approve is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into claim from booking_private.phone_invitation_claims where id=target_claim_id;
 select * into invitation from public.business_invitations where id=claim.invitation_id for update;
 if invitation.id is null or not booking_private.is_active_business_owner(invitation.business_id) or invitation.recipient_phone is null then raise exception 'Accès refusé' using errcode='42501'; end if;
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
 values(selected_collaborator,invitation.business_id,claim.profile_id,invitation.internal_role,permissions,auth.uid(),null)
 on conflict(collaborator_id) do update set internal_role=excluded.internal_role,permissions=excluded.permissions,granted_by=auth.uid(),revoked_at=null,updated_at=now();
 update public.business_invitations set status='accepted',accepted_at=now(),accepted_by=claim.profile_id,collaborator_id=selected_collaborator where id=invitation.id;
 update booking_private.phone_invitation_claims set status=case when id=claim.id then 'approved' else 'rejected' end,decided_at=now() where invitation_id=invitation.id and status='pending';
 delete from booking_private.business_invitation_secrets where invitation_id=invitation.id;
 insert into booking_private.business_invitation_events(business_id,invitation_id,collaborator_id,actor_id,event_type,details) values(invitation.business_id,invitation.id,selected_collaborator,auth.uid(),'accepted',jsonb_build_object('channel','whatsapp','confirmed_profile',claim.profile_id,'permissions',permissions));
 insert into public.notifications(profile_id,kind,title,body,data) values(claim.profile_id,'salon_collaborator','Accès à l’équipe confirmé','Le responsable du salon a confirmé votre accès.',jsonb_build_object('business_id',invitation.business_id,'href','/staff'));
 return selected_collaborator;
end; $$;
revoke all on function public.review_business_phone_invitation(uuid,boolean) from public,anon;
grant execute on function public.review_business_phone_invitation(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
