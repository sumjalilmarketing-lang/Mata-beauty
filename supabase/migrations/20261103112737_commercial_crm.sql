begin;
do $$ begin
  if not exists(select 1 from public.admin_roles where key='commercial') then
    raise exception 'La migration department_workspaces doit être appliquée avant le CRM';
  end if;
end $$;
insert into public.admin_permissions(key,domain,description,is_sensitive)
values('crm.manage','commercial','Prospects et suivi commercial selon affectation',true) on conflict(key) do nothing;
insert into public.admin_role_permissions(role_id,permission_key)
select id,'crm.manage' from public.admin_roles where key in ('commercial','super_admin') on conflict do nothing;

-- A narrow boolean guard reads the private active-account fields without granting
-- CRM agents access to the general user directory. MFA is enforced by RBAC.
create function public.crm_actor_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.has_admin_permission('crm.manage')
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and not p.is_suspended);
$$;
revoke all on function public.crm_actor_enabled() from public,anon;
grant execute on function public.crm_actor_enabled() to authenticated;
create function public.crm_can_access(assignee uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select public.crm_actor_enabled() and (assignee=auth.uid() or public.is_super_admin());
$$;
revoke all on function public.crm_can_access(uuid) from public,anon;
grant execute on function public.crm_can_access(uuid) to authenticated;

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 2 and 160),
  contact_name text not null default '' check(length(contact_name)<=120),
  email text check(email is null or (length(email)<=254 and email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text not null default '' check(length(phone)<=40 and phone ~ '^[0-9+(). /-]*$'),
  city text not null default '' check(length(city)<=100),
  address text not null default '' check(length(address)<=300),
  source text not null default 'Terrain' check(length(source)<=80),
  stage text not null default 'new' check(stage in ('new','contacted','meeting','proposal','onboarding','won','lost')),
  lost_reason text not null default '' check(length(lost_reason)<=1000),
  next_follow_up_at timestamptz,
  linked_provider_id uuid references public.provider_profiles(profile_id) on delete set null,
  assigned_to uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  version integer not null default 1,
  search_text text generated always as (lower(name||' '||contact_name||' '||coalesce(email,'')||' '||phone||' '||city)) stored,
  check(stage<>'lost' or length(trim(lost_reason))>=2)
);
create index crm_leads_assignee_updated_idx on public.crm_leads(assigned_to,updated_at desc,id);
create index crm_leads_follow_up_idx on public.crm_leads(assigned_to,next_follow_up_at) where archived_at is null and stage not in ('won','lost');
create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete restrict,
  kind text not null check(kind in ('note','call','meeting','email','whatsapp','created','updated','assigned','archived','restored')),
  body text not null check(length(trim(body)) between 1 and 4000),
  actor_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  actor_name text not null default '',
  created_at timestamptz not null default now()
);
create index crm_activities_lead_created_idx on public.crm_activities(lead_id,created_at desc,id);
alter table public.crm_leads enable row level security;
alter table public.crm_activities enable row level security;
revoke all on public.crm_leads,public.crm_activities from public,anon,authenticated;
grant select on public.crm_leads,public.crm_activities to authenticated;
grant insert(name,contact_name,email,phone,city,address,source,stage,lost_reason,next_follow_up_at,linked_provider_id) on public.crm_leads to authenticated;
grant update(name,contact_name,email,phone,city,address,source,stage,lost_reason,next_follow_up_at,linked_provider_id,archived_at) on public.crm_leads to authenticated;
grant insert(lead_id,kind,body) on public.crm_activities to authenticated;
grant all on public.crm_leads,public.crm_activities to service_role;
create policy "CRM assigned read" on public.crm_leads for select to authenticated using(public.crm_can_access(assigned_to));
create policy "CRM own creation" on public.crm_leads for insert to authenticated with check(public.crm_actor_enabled() and assigned_to=auth.uid() and created_by=auth.uid());
create policy "CRM assigned update" on public.crm_leads for update to authenticated using(public.crm_can_access(assigned_to)) with check(public.crm_can_access(assigned_to));
create policy "CRM assigned activity read" on public.crm_activities for select to authenticated using(exists(select 1 from public.crm_leads l where l.id=lead_id and public.crm_can_access(l.assigned_to)));
create policy "CRM manual activity creation" on public.crm_activities for insert to authenticated with check(
  public.crm_actor_enabled() and actor_id=auth.uid() and kind in ('note','call','meeting','email','whatsapp')
  and exists(select 1 from public.crm_leads l where l.id=lead_id and l.archived_at is null and public.crm_can_access(l.assigned_to)));

create function public.crm_guard_lead() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Permit only FK-driven unlinking when a professional account is deleted.
  if tg_op='UPDATE' and pg_trigger_depth()>1 and old.linked_provider_id is not null and new.linked_provider_id is null
    and (to_jsonb(new)-'linked_provider_id'-'search_text')=(to_jsonb(old)-'linked_provider_id'-'search_text')
    and not exists(select 1 from public.provider_profiles p where p.profile_id=old.linked_provider_id) then
    new.version:=old.version+1; new.updated_at:=now(); return new;
  end if;
  if not public.crm_actor_enabled() then raise exception 'Accès CRM refusé' using errcode='42501'; end if;
  if tg_op='INSERT' then
    new.created_by:=auth.uid(); new.assigned_to:=auth.uid(); new.version:=1; new.created_at:=now(); new.updated_at:=now(); new.archived_at:=null;
  else
    if not public.crm_can_access(old.assigned_to) then raise exception 'Prospect inaccessible' using errcode='42501'; end if;
    if new.assigned_to is distinct from old.assigned_to and not public.is_super_admin() then raise exception 'Réaffectation réservée au Super Admin' using errcode='42501'; end if;
    new.id:=old.id; new.created_by:=old.created_by; new.created_at:=old.created_at; new.version:=old.version+1; new.updated_at:=now();
  end if;
  return new;
end; $$;
create trigger crm_lead_guard before insert or update on public.crm_leads for each row execute function public.crm_guard_lead();
create function public.crm_stamp_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Serialize with reassignment and recheck access: a former assignee cannot
  -- append a note after another transaction has transferred the lead.
  perform 1 from public.crm_leads l where l.id=new.lead_id and public.crm_can_access(l.assigned_to) for update;
  if not found then raise exception 'Prospect inaccessible' using errcode='42501'; end if;
  new.actor_id:=auth.uid(); new.created_at:=now();
  select coalesce(nullif(trim(p.display_name),''),'Équipe commerciale') into new.actor_name from public.profiles p where p.id=auth.uid();
  return new;
end; $$;
create trigger crm_activity_stamp before insert on public.crm_activities for each row execute function public.crm_stamp_activity();
create function public.crm_log_lead() returns trigger language plpgsql security definer set search_path='' as $$
declare event_kind text; event_body text;
begin
  if tg_op='UPDATE' and old.linked_provider_id is not null and new.linked_provider_id is null
    and (to_jsonb(new)-'linked_provider_id'-'search_text'-'updated_at'-'version')=(to_jsonb(old)-'linked_provider_id'-'search_text'-'updated_at'-'version')
    and not exists(select 1 from public.provider_profiles p where p.profile_id=old.linked_provider_id) then return new; end if;
  if tg_op='INSERT' then event_kind:='created'; event_body:='Prospect créé';
  elsif new.assigned_to is distinct from old.assigned_to then event_kind:='assigned'; event_body:='Responsable commercial modifié';
  elsif new.archived_at is distinct from old.archived_at then event_kind:=case when new.archived_at is null then 'restored' else 'archived' end; event_body:=case when new.archived_at is null then 'Prospect restauré' else 'Prospect archivé' end;
  else event_kind:='updated'; event_body:=case when new.stage is distinct from old.stage then 'Étape : '||old.stage||' → '||new.stage else 'Fiche et relance mises à jour' end;
  end if;
  insert into public.crm_activities(lead_id,kind,body) values(new.id,event_kind,event_body);
  return new;
end; $$;
create trigger crm_lead_history after insert or update on public.crm_leads for each row execute function public.crm_log_lead();
revoke all on function public.crm_guard_lead(),public.crm_stamp_activity(),public.crm_log_lead() from public,anon,authenticated;

create function public.crm_list_assignees() returns table(id uuid,label text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.crm_actor_enabled() then raise exception 'Accès CRM refusé' using errcode='42501'; end if;
  return query select p.id,coalesce(nullif(trim(p.display_name),''),'Membre commercial') from public.profiles p
  where p.account_status='active' and not p.is_suspended and (public.is_super_admin() or p.id=auth.uid())
    and exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id
      where m.user_id=p.id and m.is_active and m.revoked_at is null and r.is_active and r.key in ('commercial','super_admin'))
  order by 2,p.id;
end; $$;
create function public.crm_assign_lead(target_lead uuid,target_version integer,target_assignee uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.crm_actor_enabled() or not public.is_super_admin() then raise exception 'Super Admin requis' using errcode='42501'; end if;
  if not exists(select 1 from public.crm_list_assignees() a where a.id=target_assignee) then raise exception 'Commercial actif requis' using errcode='22023'; end if;
  update public.crm_leads set assigned_to=target_assignee where id=target_lead and version=target_version;
  if not found then raise exception 'Prospect modifié depuis son ouverture' using errcode='40001'; end if;
end; $$;
create function public.crm_metrics(search_term text default '',archived boolean default false) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.crm_actor_enabled() then raise exception 'Accès CRM refusé' using errcode='42501'; end if;
  if length(search_term)>160 then raise exception 'Recherche trop longue' using errcode='22023'; end if;
  return (with scoped as (
    select l.stage,l.next_follow_up_at from public.crm_leads l
    where (l.archived_at is not null)=archived and strpos(l.search_text,lower(trim(search_term)))>0
  ), stages as (select s.stage,count(*) as amount from scoped s group by s.stage)
  select jsonb_build_object('total',(select count(*) from scoped),
    'due',case when archived then 0 else (select count(*) from scoped where stage not in ('won','lost') and next_follow_up_at<=now()) end,
    'stages',coalesce((select jsonb_object_agg(stage,amount) from stages),'{}'::jsonb)));
end; $$;
create function public.crm_find_professionals(search_term text) returns table(profile_id uuid,business_name text,city text,status text)
language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.crm_actor_enabled() or not public.has_admin_permission('providers.read') then raise exception 'Accès aux dossiers refusé' using errcode='42501'; end if;
  if length(trim(search_term))<2 or length(search_term)>160 then return; end if;
  return query select p.profile_id,p.business_name,p.city,p.status::text from public.provider_profiles p
    where strpos(lower(p.business_name||' '||p.city),lower(trim(search_term)))>0 order by p.business_name,p.profile_id limit 20;
end; $$;
revoke all on function public.crm_list_assignees(),public.crm_assign_lead(uuid,integer,uuid),public.crm_metrics(text,boolean),public.crm_find_professionals(text) from public,anon;
grant execute on function public.crm_list_assignees(),public.crm_assign_lead(uuid,integer,uuid),public.crm_metrics(text,boolean),public.crm_find_professionals(text) to authenticated;
commit;
