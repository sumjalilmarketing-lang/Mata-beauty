begin;

-- Salon account access is deliberately separate from public employee cards.
-- Tokens and grants live in the already-private booking_private namespace.
create table booking_private.collaborator_access (
  collaborator_id uuid primary key references public.collaborators(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  internal_role text not null default 'member' check (internal_role in ('manager','reception','member')),
  permissions text[] not null default '{}',
  granted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, profile_id),
  check (permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read']::text[]),
  check (not ('bookings.manage'=any(permissions)) or 'bookings.read'=any(permissions)),
  check (not ('messages.reply'=any(permissions)) or 'messages.read'=any(permissions))
);

create table booking_private.business_invitation_secrets (
  invitation_id uuid primary key references public.business_invitations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  permissions text[] not null check (cardinality(permissions) between 1 and 8),
  created_at timestamptz not null default now(),
  check (permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read']::text[]),
  check (not ('bookings.manage'=any(permissions)) or 'bookings.read'=any(permissions)),
  check (not ('messages.reply'=any(permissions)) or 'messages.read'=any(permissions))
);

create table booking_private.business_invitation_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invitation_id uuid references public.business_invitations(id) on delete set null,
  collaborator_id uuid references public.collaborators(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('invited','delivery_confirmed','delivery_failed','accepted','invitation_revoked','access_updated','access_revoked','left')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.business_invitations
  add column accepted_by uuid references public.profiles(id) on delete set null,
  add column collaborator_id uuid references public.collaborators(id) on delete set null,
  add column revoked_at timestamptz,
  add column sent_at timestamptz;

create index collaborator_access_profile_idx on booking_private.collaborator_access(profile_id) where revoked_at is null;
create index collaborator_access_business_idx on booking_private.collaborator_access(business_id,collaborator_id) where revoked_at is null;
create index salon_invite_events_business_idx on booking_private.business_invitation_events(business_id,created_at desc);
alter table booking_private.collaborator_access enable row level security;
alter table booking_private.business_invitation_secrets enable row level security;
alter table booking_private.business_invitation_events enable row level security;
revoke all on schema booking_private from public, anon, authenticated;
grant usage on schema booking_private to authenticated, service_role;
revoke all on booking_private.collaborator_access, booking_private.business_invitation_secrets, booking_private.business_invitation_events from public, anon, authenticated;
grant all on booking_private.collaborator_access, booking_private.business_invitation_secrets, booking_private.business_invitation_events to service_role;

-- Preserve the existing public/team fields, but remove access to profile_id,
-- internal_role and other account-control attributes from Data API callers.
do $$ declare column_name text; privilege_name text; begin
  for column_name in select a.attname from pg_attribute a
    where a.attrelid='public.collaborators'::regclass and a.attnum>0 and not a.attisdropped
  loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','REFERENCES']::text[] loop
      execute format('revoke %s (%I) on table public.collaborators from anon,authenticated',privilege_name,column_name);
    end loop;
  end loop;
end $$;
revoke all on public.collaborators from public, anon, authenticated;
grant select (id,business_id,display_name,title,avatar_url,is_bookable,is_active,created_at,updated_at,archived_at,first_name,public_last_name,specialties,buffer_minutes)
  on public.collaborators to anon, authenticated;
grant update (display_name,title,avatar_url,is_bookable,is_active,updated_at,archived_at,first_name,public_last_name,specialties,buffer_minutes)
  on public.collaborators to authenticated;
create or replace view public.collaborators_public with (security_invoker=true) as
  select id,business_id,display_name,title,avatar_url,is_bookable,is_active,created_at,updated_at,archived_at,first_name,public_last_name,specialties,buffer_minutes
  from public.collaborators;
revoke all on public.collaborators_public from public, anon, authenticated;
grant select on public.collaborators_public to anon, authenticated;

-- Invitation rows contain email addresses and remain owner-only. No Data API
-- role can query or insert them directly; the following narrow RPCs do so.
revoke all on public.business_invitations from public, anon, authenticated;

insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role,permissions,granted_by)
select c.id,c.business_id,c.profile_id,c.internal_role,'{}'::text[],b.owner_id
from public.collaborators c join public.businesses b on b.id=c.business_id
where c.profile_id is not null
on conflict (business_id,profile_id) do nothing;

create or replace function booking_private.active_staff_permission(target_profile uuid,target_collaborator uuid,target_permission text)
returns boolean language sql stable security definer set search_path='' as $$
  select target_profile=auth.uid() and exists (
    select 1 from booking_private.collaborator_access a
    join public.collaborators c on c.id=a.collaborator_id and c.business_id=a.business_id
    join public.businesses b on b.id=a.business_id
    join public.profiles p on p.id=a.profile_id
    where a.profile_id=target_profile and a.collaborator_id=target_collaborator
      and a.revoked_at is null and c.profile_id=a.profile_id and c.is_active and c.archived_at is null
      and b.archived_at is null and p.account_status='active' and not p.is_suspended
      and target_permission=any(a.permissions)
  );
$$;
revoke all on function booking_private.active_staff_permission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function booking_private.active_staff_permission(uuid,uuid,text) to authenticated,service_role;

create or replace function booking_private.is_active_business_owner(target_business uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.businesses b join public.profiles p on p.id=b.owner_id
    where b.id=target_business and b.owner_id=auth.uid() and b.archived_at is null
      and p.account_status='active' and not p.is_suspended);
$$;
revoke all on function booking_private.is_active_business_owner(uuid) from public,anon,authenticated;

create or replace function public.current_collaborator_access()
returns table(business_id uuid,collaborator_id uuid,internal_role text,permissions text[])
language sql stable security definer set search_path='' as $$
  select a.business_id,a.collaborator_id,a.internal_role,a.permissions
  from booking_private.collaborator_access a
  join public.collaborators c on c.id=a.collaborator_id and c.business_id=a.business_id
  join public.businesses b on b.id=a.business_id
  join public.profiles p on p.id=a.profile_id
  where a.profile_id=auth.uid() and a.revoked_at is null and c.profile_id=a.profile_id
    and c.is_active and c.archived_at is null and b.archived_at is null
    and p.account_status='active' and not p.is_suspended and cardinality(a.permissions)>0;
$$;
revoke all on function public.current_collaborator_access() from public,anon;
grant execute on function public.current_collaborator_access() to authenticated;

create or replace function public.owner_list_business_invitations(target_business_id uuid)
returns table(id uuid,email text,internal_role text,status text,expires_at timestamptz,created_at timestamptz,accepted_at timestamptz,sent_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  return query select i.id,i.email,i.internal_role,i.status,i.expires_at,i.created_at,i.accepted_at,i.sent_at
    from public.business_invitations i where i.business_id=target_business_id order by i.created_at desc limit 100;
end;
$$;
revoke all on function public.owner_list_business_invitations(uuid) from public,anon;
grant execute on function public.owner_list_business_invitations(uuid) to authenticated;

create or replace function public.owner_list_collaborator_access(target_business_id uuid)
returns table(collaborator_id uuid,profile_id uuid,display_name text,email text,internal_role text,permissions text[],revoked_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  return query select c.id,c.profile_id,c.display_name,u.email,a.internal_role,a.permissions,a.revoked_at
    from booking_private.collaborator_access a join public.collaborators c on c.id=a.collaborator_id
    left join auth.users u on u.id=a.profile_id
    where a.business_id=target_business_id order by c.display_name limit 200;
end;
$$;
revoke all on function public.owner_list_collaborator_access(uuid) from public,anon;
grant execute on function public.owner_list_collaborator_access(uuid) to authenticated;

create or replace function public.owner_list_collaborator_audit(target_business_id uuid)
returns table(id uuid,invitation_id uuid,collaborator_id uuid,actor_id uuid,event_type text,details jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  return query select e.id,e.invitation_id,e.collaborator_id,e.actor_id,e.event_type,e.details,e.created_at
    from booking_private.business_invitation_events e where e.business_id=target_business_id order by e.created_at desc limit 200;
end;
$$;
revoke all on function public.owner_list_collaborator_audit(uuid) from public,anon;
grant execute on function public.owner_list_collaborator_audit(uuid) to authenticated;

create or replace function public.create_business_invitation(target_business_id uuid,target_email text,target_role text,target_permissions text[],target_token_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation_id uuid; normalized_email text:=lower(trim(target_email));
begin
  if auth.uid() is null or not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(normalized_email)>254 then raise exception 'Adresse e-mail invalide'; end if;
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
    where business_id=target_business_id and email=normalized_email and status='pending' and expires_at<=now()
    returning id
  ) delete from booking_private.business_invitation_secrets s using expired e where s.invitation_id=e.id;
  if exists(select 1 from public.business_invitations i where i.business_id=target_business_id and i.email=normalized_email and i.status='pending' and i.expires_at>now()) then raise exception 'Une invitation en attente existe déjà'; end if;
  insert into public.business_invitations(business_id,email,internal_role,status,invited_by,expires_at)
    values(target_business_id,normalized_email,target_role,'pending',auth.uid(),now()+interval '48 hours') returning id into invitation_id;
  insert into booking_private.business_invitation_secrets(invitation_id,token_hash,permissions) values(invitation_id,target_token_hash,target_permissions);
  insert into booking_private.business_invitation_events(business_id,invitation_id,actor_id,event_type,details)
    values(target_business_id,invitation_id,auth.uid(),'invited',jsonb_build_object('role',target_role,'permissions',target_permissions));
  return invitation_id;
end;
$$;
revoke all on function public.create_business_invitation(uuid,text,text,text[],text) from public,anon;
grant execute on function public.create_business_invitation(uuid,text,text,text[],text) to authenticated;

create or replace function public.mark_business_invitation_sent(target_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare business uuid;
begin
  update public.business_invitations i set sent_at=now() where i.id=target_invitation_id and i.status='pending'
    and booking_private.is_active_business_owner(i.business_id) returning i.business_id into business;
  if business is null then raise exception 'Invitation inaccessible' using errcode='42501'; end if;
  insert into booking_private.business_invitation_events(business_id,invitation_id,actor_id,event_type)
    values(business,target_invitation_id,auth.uid(),'delivery_confirmed');
end;
$$;
revoke all on function public.mark_business_invitation_sent(uuid) from public,anon;
grant execute on function public.mark_business_invitation_sent(uuid) to authenticated;

create or replace function public.revoke_business_invitation(target_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare business uuid;
begin
  update public.business_invitations i set status='revoked',revoked_at=now() where i.id=target_invitation_id and i.status='pending'
    and booking_private.is_active_business_owner(i.business_id) returning i.business_id into business;
  if business is null then raise exception 'Invitation inaccessible' using errcode='42501'; end if;
  delete from booking_private.business_invitation_secrets where invitation_id=target_invitation_id;
  insert into booking_private.business_invitation_events(business_id,invitation_id,actor_id,event_type)
    values(business,target_invitation_id,auth.uid(),'invitation_revoked');
end;
$$;
revoke all on function public.revoke_business_invitation(uuid) from public,anon;
grant execute on function public.revoke_business_invitation(uuid) to authenticated;

create or replace function public.fail_business_invitation_delivery(target_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare business uuid;
begin
  update public.business_invitations i set status='revoked',revoked_at=now()
    where i.id=target_invitation_id and i.status='pending'
      and booking_private.is_active_business_owner(i.business_id) returning i.business_id into business;
  if business is null then raise exception 'Invitation inaccessible' using errcode='42501'; end if;
  delete from booking_private.business_invitation_secrets where invitation_id=target_invitation_id;
  insert into booking_private.business_invitation_events(business_id,invitation_id,actor_id,event_type)
    values(business,target_invitation_id,auth.uid(),'delivery_failed');
end;
$$;
revoke all on function public.fail_business_invitation_delivery(uuid) from public,anon;
grant execute on function public.fail_business_invitation_delivery(uuid) to authenticated;

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
  if invitation.id is null or invitation.status<>'pending' or invitation.expires_at<=now() or invitation.email<>actor_email then raise exception 'Invitation invalide, expirée ou destinée à une autre adresse' using errcode='42501'; end if;
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

create or replace function public.update_business_collaborator_access(target_business_id uuid,target_collaborator_id uuid,target_role text,target_permissions text[])
returns void language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
  if not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if target_role is null or target_role not in ('manager','reception','member') or target_permissions is null
    or cardinality(target_permissions) not between 1 and 5 or array_position(target_permissions,null) is not null
    or cardinality(target_permissions)<>(select count(distinct permission) from unnest(target_permissions) as item(permission))
    or not(target_permissions <@ array['bookings.read','bookings.manage','messages.read','messages.reply','services.read']::text[])
    or ('bookings.manage'=any(target_permissions) and not 'bookings.read'=any(target_permissions))
    or ('messages.reply'=any(target_permissions) and not 'messages.read'=any(target_permissions)) then raise exception 'Permissions invalides'; end if;
  select c.profile_id into profile from public.collaborators c where c.id=target_collaborator_id and c.business_id=target_business_id and c.profile_id is not null;
  if profile is null then raise exception 'Compte collaborateur non associé' using errcode='42501'; end if;
  insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role,permissions,granted_by,revoked_at)
    values(target_collaborator_id,target_business_id,profile,target_role,target_permissions,auth.uid(),null)
    on conflict(collaborator_id) do update set internal_role=excluded.internal_role,permissions=excluded.permissions,granted_by=auth.uid(),revoked_at=null,updated_at=now();
  update public.collaborators set internal_role=target_role,updated_at=now() where id=target_collaborator_id and business_id=target_business_id;
  insert into booking_private.business_invitation_events(business_id,collaborator_id,actor_id,event_type,details)
    values(target_business_id,target_collaborator_id,auth.uid(),'access_updated',jsonb_build_object('role',target_role,'permissions',target_permissions));
end;
$$;
revoke all on function public.update_business_collaborator_access(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.update_business_collaborator_access(uuid,uuid,text,text[]) to authenticated;

create or replace function public.revoke_business_collaborator_access(target_business_id uuid,target_collaborator_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare profile uuid;
begin
  if not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  update booking_private.collaborator_access set permissions='{}',revoked_at=now(),updated_at=now()
    where business_id=target_business_id and collaborator_id=target_collaborator_id returning profile_id into profile;
  if profile is null then raise exception 'Accès collaborateur introuvable'; end if;
  delete from public.conversation_members cm using public.conversations cv,public.bookings b
    where cm.profile_id=profile and cv.id=cm.conversation_id and b.id=cv.booking_id
      and b.business_id=target_business_id and b.collaborator_id=target_collaborator_id;
  insert into booking_private.business_invitation_events(business_id,collaborator_id,actor_id,event_type)
    values(target_business_id,target_collaborator_id,auth.uid(),'access_revoked');
end;
$$;
revoke all on function public.revoke_business_collaborator_access(uuid,uuid) from public,anon;
grant execute on function public.revoke_business_collaborator_access(uuid,uuid) to authenticated;

create or replace function public.list_staff_message_bookings()
returns table(id uuid,starts_at timestamptz,status text,service_title text)
language sql stable security definer set search_path='' as $$
  select b.id,b.starts_at,b.status,s.title from public.bookings b
  join booking_private.collaborator_access a on a.collaborator_id=b.collaborator_id and a.business_id=b.business_id
  join public.collaborators c on c.id=a.collaborator_id and c.profile_id=auth.uid() and c.is_active and c.archived_at is null
  join public.profiles p on p.id=auth.uid() and p.account_status='active' and not p.is_suspended
  join public.provider_services s on s.id=b.provider_service_id
  where a.profile_id=auth.uid() and a.revoked_at is null and 'messages.read'=any(a.permissions)
  order by b.starts_at desc limit 100;
$$;
revoke all on function public.list_staff_message_bookings() from public,anon;
grant execute on function public.list_staff_message_bookings() to authenticated;

create or replace function public.get_staff_booking_context(target_booking_id uuid)
returns table(client_id uuid,provider_id uuid,starts_at timestamptz,status text,service_title text)
language sql stable security definer set search_path='' as $$
  select b.client_id,b.provider_id,b.starts_at,b.status,s.title from public.bookings b
  join booking_private.collaborator_access a on a.collaborator_id=b.collaborator_id and a.business_id=b.business_id
  join public.collaborators c on c.id=a.collaborator_id and c.profile_id=auth.uid() and c.is_active and c.archived_at is null
  join public.profiles p on p.id=auth.uid() and p.account_status='active' and not p.is_suspended
  join public.provider_services s on s.id=b.provider_service_id
  where b.id=target_booking_id and a.profile_id=auth.uid() and a.revoked_at is null and 'messages.read'=any(a.permissions);
$$;
revoke all on function public.get_staff_booking_context(uuid) from public,anon;
grant execute on function public.get_staff_booking_context(uuid) to authenticated;

create or replace function public.get_staff_booking_agenda(from_date date default current_date,days integer default 31)
returns table(id uuid,starts_at timestamptz,ends_at timestamptz,status text,service_title text,client_name text)
language sql stable security definer set search_path='' as $$
  select b.id,b.starts_at,b.ends_at,b.status,s.title,
    coalesce(nullif(trim(coalesce(p.display_name,'')||' '||coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),''),'Client')
  from public.bookings b
  join booking_private.collaborator_access a on a.collaborator_id=b.collaborator_id and a.business_id=b.business_id
  join public.collaborators c on c.id=a.collaborator_id and c.profile_id=auth.uid() and c.is_active and c.archived_at is null
  join public.profiles active on active.id=auth.uid() and active.account_status='active' and not active.is_suspended
  join public.provider_services s on s.id=b.provider_service_id
  join public.profiles p on p.id=b.client_id
  where a.profile_id=auth.uid() and a.revoked_at is null and 'bookings.read'=any(a.permissions)
    and b.starts_at >= (from_date::timestamp at time zone 'Africa/Dakar')
    and b.starts_at < ((from_date+greatest(1,least(days,93)))::timestamp at time zone 'Africa/Dakar')
  order by b.starts_at,b.id limit 500;
$$;
revoke all on function public.get_staff_booking_agenda(date,integer) from public,anon;
grant execute on function public.get_staff_booking_agenda(date,integer) to authenticated;

create or replace function public.get_staff_services()
returns table(id uuid,title text,description text,duration_minutes integer,price_amount integer,currency text,is_active boolean)
language sql stable security definer set search_path='' as $$
  select distinct s.id,s.title,s.description,s.duration_minutes,s.price_amount,s.currency,s.is_active
  from booking_private.collaborator_access a
  join public.collaborators c on c.id=a.collaborator_id and c.business_id=a.business_id
  join public.collaborator_services cs on cs.collaborator_id=c.id
  join public.provider_services s on s.id=cs.provider_service_id and s.business_id=a.business_id
  join public.businesses b on b.id=a.business_id and b.owner_id=s.provider_id and b.status='approved' and b.is_active and b.archived_at is null
  join public.profiles p on p.id=auth.uid() and p.account_status='active' and not p.is_suspended
  where a.profile_id=auth.uid() and a.revoked_at is null and c.profile_id=auth.uid()
    and c.is_active and c.archived_at is null and 'services.read'=any(a.permissions)
    and s.is_active and s.archived_at is null
  order by s.title limit 100;
$$;
revoke all on function public.get_staff_services() from public,anon;
grant execute on function public.get_staff_services() to authenticated;

-- Preserve existing participant and provider transitions while allowing the
-- dedicated staff RPC to make only the narrower transitions it authorizes.
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
  if auth.uid()=old.provider_id and new.status=old.status and new.collaborator_id is distinct from old.collaborator_id then return new; end if;
  staff_actor:=current_setting('app.staff_booking_action',true)='true' and old.collaborator_id is not null
    and booking_private.active_staff_permission(auth.uid(),old.collaborator_id,'bookings.manage');
  if staff_actor and new.collaborator_id is distinct from old.collaborator_id then raise exception 'Un collaborateur ne peut pas réaffecter une réservation' using errcode='42501'; end if;
  transition_allowed:=case old.status
    when 'pending' then new.status in ('confirmed','declined','cancelled_by_client','cancelled_by_provider')
    when 'confirmed' then new.status in ('cancelled_by_client','cancelled_by_provider','in_progress','no_show','disputed')
    when 'in_progress' then new.status in ('completed','disputed')
    when 'completed' then new.status='disputed'
    when 'no_show' then new.status='disputed'
    else false end;
  if not transition_allowed then raise exception 'Transition de réservation interdite : % vers %',old.status,new.status; end if;
  if staff_actor then
    if (old.status='pending' and new.status in ('confirmed','declined'))
      or (old.status='confirmed' and new.status in ('in_progress','no_show'))
      or (old.status='in_progress' and new.status='completed') then return new; end if;
    raise exception 'Transition de rendez-vous non autorisée au collaborateur' using errcode='42501';
  end if;
  if auth.uid()=old.client_id and new.status not in ('cancelled_by_client','disputed') then raise exception 'Transition non autorisée pour le client'; end if;
  if auth.uid()=old.provider_id and new.status not in ('confirmed','declined','cancelled_by_provider','in_progress','completed','no_show','disputed') then raise exception 'Transition non autorisée pour le prestataire'; end if;
  if auth.uid() not in (old.client_id,old.provider_id) then raise exception 'Modification de réservation interdite'; end if;
  return new;
end;
$$;

create or replace function public.staff_update_booking_status(target_booking_id uuid,target_status public.booking_status)
returns void language plpgsql security definer set search_path='' as $$
declare current_status public.booking_status; collaborator uuid;
begin
  select b.status,b.collaborator_id into current_status,collaborator from public.bookings b where b.id=target_booking_id for update;
  if current_status is null or collaborator is null or not booking_private.active_staff_permission(auth.uid(),collaborator,'bookings.manage') then raise exception 'Réservation inaccessible' using errcode='42501'; end if;
  if not ((current_status='pending' and target_status in ('confirmed','declined'))
      or (current_status='confirmed' and target_status in ('in_progress','cancelled_by_provider'))
      or (current_status='in_progress' and target_status='completed')) then raise exception 'Transition de réservation interdite' using errcode='42501'; end if;
  perform set_config('app.staff_booking_action','true',true);
  update public.bookings set status=target_status where id=target_booking_id;
end;
$$;
revoke all on function public.staff_update_booking_status(uuid,public.booking_status) from public,anon;
grant execute on function public.staff_update_booking_status(uuid,public.booking_status) to authenticated;

-- Keep legacy booking conversations. Staff gain only scoped membership for the
-- booking assigned to them and only while the private grant remains active.
create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.conversation_members cm
    join public.conversations cv on cv.id=cm.conversation_id
    left join public.bookings b on b.id=cv.booking_id
    where cm.conversation_id=target_conversation_id and cm.profile_id=auth.uid()
      and (b.id is null or auth.uid() in (b.client_id,b.provider_id)
        or (b.collaborator_id is not null and booking_private.active_staff_permission(auth.uid(),b.collaborator_id,'messages.read')))
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

create or replace function public.ensure_booking_conversation(target_booking_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare selected_booking public.bookings%rowtype; selected_conversation_id uuid; staff_can_read boolean;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into selected_booking from public.bookings where id=target_booking_id;
  if not found then raise exception 'Réservation inaccessible'; end if;
  staff_can_read:=selected_booking.collaborator_id is not null and booking_private.active_staff_permission(auth.uid(),selected_booking.collaborator_id,'messages.read');
  if auth.uid() not in (selected_booking.client_id,selected_booking.provider_id) and not staff_can_read then raise exception 'Réservation inaccessible' using errcode='42501'; end if;
  insert into public.conversations(booking_id) values(target_booking_id) on conflict (booking_id) where booking_id is not null do nothing;
  select id into selected_conversation_id from public.conversations where booking_id=target_booking_id;
  insert into public.conversation_members(conversation_id,profile_id,last_read_at) values
    (selected_conversation_id,selected_booking.client_id,now()),(selected_conversation_id,selected_booking.provider_id,now())
    on conflict(conversation_id,profile_id) do nothing;
  if staff_can_read then insert into public.conversation_members(conversation_id,profile_id,last_read_at)
    values(selected_conversation_id,auth.uid(),now()) on conflict(conversation_id,profile_id) do nothing; end if;
  return selected_conversation_id;
end;
$$;
revoke all on function public.ensure_booking_conversation(uuid) from public,anon;
grant execute on function public.ensure_booking_conversation(uuid) to authenticated;

drop policy if exists "messages member insert" on public.messages;
create policy "messages participant or authorized salon staff insert" on public.messages for insert to authenticated
  with check (sender_id=auth.uid() and public.is_conversation_member(conversation_id) and exists(
    select 1 from public.conversations cv left join public.bookings b on b.id=cv.booking_id
    where cv.id=conversation_id and (b.id is null or auth.uid() in (b.client_id,b.provider_id)
      or (b.collaborator_id is not null and booking_private.active_staff_permission(auth.uid(),b.collaborator_id,'messages.reply')))
  ));

notify pgrst,'reload schema';
commit;
