begin;
-- Self-declared qualifications never modify another employee or salon pricing.
create function public.staff_service_catalog()
returns table(collaborator_id uuid,business_id uuid,salon_name text,service_id uuid,title text,assigned boolean)
language sql stable security definer set search_path='' as $$
 select a.collaborator_id,a.business_id,b.name,s.id,s.title,exists(select 1 from public.collaborator_services cs where cs.collaborator_id=a.collaborator_id and cs.provider_service_id=s.id)
 from public.current_collaborator_access() a join public.businesses b on b.id=a.business_id
 join public.provider_services s on s.business_id=b.id and s.provider_id=b.owner_id
 where 'services.read'=any(a.permissions) and s.archived_at is null;
$$;
create function public.staff_set_service(target_collaborator uuid,target_service uuid,enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare salon uuid;
begin
 select a.business_id into salon from public.current_collaborator_access() a where a.collaborator_id=target_collaborator and 'services.read'=any(a.permissions);
 if salon is null or not exists(select 1 from public.provider_services s where s.id=target_service and s.business_id=salon and s.archived_at is null) then raise exception 'Accès refusé' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(salon::text,8110));
 if enabled then insert into public.collaborator_services(collaborator_id,provider_service_id) values(target_collaborator,target_service) on conflict do nothing;
 else delete from public.collaborator_services where collaborator_id=target_collaborator and provider_service_id=target_service;end if;
 insert into public.notifications(profile_id,kind,title,body,data) select b.owner_id,'staff_services','Prestations du collaborateur modifiées',c.display_name||' a mis à jour les prestations qu’il réalise.',jsonb_build_object('href','/salon/team','collaborator_id',c.id) from public.businesses b join public.collaborators c on c.business_id=b.id where c.id=target_collaborator;
end $$;
-- A free-text declaration can describe work missing from the commercial catalog.
-- It does not silently invent a duration/price for a bookable service.
create table public.staff_service_declarations(
 id uuid primary key default gen_random_uuid(),collaborator_id uuid not null references public.collaborators(id),business_id uuid not null references public.businesses(id),
 title text not null check(length(trim(title)) between 2 and 120),description text not null default '' check(length(description)<=2000),created_at timestamptz not null default now()
);
alter table public.staff_service_declarations enable row level security;
revoke all on public.staff_service_declarations from public,anon,authenticated;
create function public.staff_declare_service(target_collaborator uuid,target_title text,target_description text default '')
returns void language plpgsql security definer set search_path='' as $$
declare salon uuid;
begin
 select a.business_id into salon from public.current_collaborator_access() a where a.collaborator_id=target_collaborator and 'services.read'=any(a.permissions);
 if salon is null then raise exception 'Accès refusé' using errcode='42501';end if;
 insert into public.staff_service_declarations(collaborator_id,business_id,title,description)values(target_collaborator,salon,trim(target_title),trim(target_description));
 insert into public.notifications(profile_id,kind,title,body,data)select owner_id,'staff_services','Prestation à ajouter au catalogue',target_title,jsonb_build_object('href','/salon/team')from public.businesses where id=salon;
end $$;
create function public.list_staff_service_declarations(target_business uuid default null)
returns setof public.staff_service_declarations language sql stable security definer set search_path='' as $$
 select d.* from public.staff_service_declarations d where (target_business is null or d.business_id=target_business) and
 (exists(select 1 from public.current_collaborator_access() a where a.collaborator_id=d.collaborator_id) or (target_business is not null and exists(select 1 from public.businesses b join public.profiles p on p.id=b.owner_id where b.id=d.business_id and b.owner_id=auth.uid() and p.account_status='active' and not p.is_suspended))) order by d.created_at desc limit 200;
$$;
create table public.salon_staff_tasks(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),collaborator_id uuid not null references public.collaborators(id),
 assigned_by uuid not null references public.profiles(id),title text not null check(length(trim(title)) between 2 and 160),description text not null default '' check(length(description)<=2000),
 due_at timestamptz,status text not null default 'todo' check(status in('todo','in_progress','done')),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index salon_staff_tasks_assignee on public.salon_staff_tasks(collaborator_id,status,due_at);
alter table public.salon_staff_tasks enable row level security;
revoke all on public.salon_staff_tasks from public,anon,authenticated;
create function public.list_my_staff_tasks(target_business uuid default null)
returns setof public.salon_staff_tasks language sql stable security definer set search_path='' as $$
 select t.* from public.salon_staff_tasks t where (target_business is null or t.business_id=target_business) and
 (exists(select 1 from public.current_collaborator_access() a where a.collaborator_id=t.collaborator_id and a.business_id=t.business_id) or (target_business is not null and exists(select 1 from public.businesses b join public.profiles p on p.id=b.owner_id where b.id=t.business_id and b.owner_id=auth.uid() and p.account_status='active' and not p.is_suspended))) order by t.created_at desc limit 200;
$$;
create function public.assign_salon_staff_task(target_business uuid,target_collaborator uuid,target_title text,target_description text default '',target_due_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare task uuid;recipient uuid;
begin
 if not exists(select 1 from public.businesses b join public.profiles p on p.id=b.owner_id where b.id=target_business and b.owner_id=auth.uid() and b.archived_at is null and p.account_status='active' and not p.is_suspended) or not exists(select 1 from public.collaborators c where c.id=target_collaborator and c.business_id=target_business and c.is_active and c.archived_at is null) then raise exception 'Accès refusé' using errcode='42501';end if;
 recipient:=booking_private.staff_booking_notification_recipient(target_collaborator);
 if recipient is null then raise exception 'Compte collaborateur actif requis';end if;
 insert into public.salon_staff_tasks(business_id,collaborator_id,assigned_by,title,description,due_at)values(target_business,target_collaborator,auth.uid(),trim(target_title),trim(target_description),target_due_at)returning id into task;
 insert into public.notifications(profile_id,kind,title,body,data)values(recipient,'staff_task','Nouvelle tâche',target_title,jsonb_build_object('href','/staff/tasks','task_id',task));return task;
end $$;
create function public.update_my_staff_task(target_task uuid,target_status text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.salon_staff_tasks%rowtype;
begin
 select * into t from public.salon_staff_tasks where id=target_task for update;
 if t.id is null or not exists(select 1 from public.list_my_staff_tasks(t.business_id) a where a.id=t.id) then raise exception 'Accès refusé' using errcode='42501';end if;
 if target_status not in('todo','in_progress','done')or target_status is null then raise exception 'Statut invalide';end if;
 update public.salon_staff_tasks set status=target_status,updated_at=now()where id=t.id;
end $$;
revoke all on function public.staff_service_catalog(),public.staff_set_service(uuid,uuid,boolean),public.staff_declare_service(uuid,text,text),public.list_staff_service_declarations(uuid),public.list_my_staff_tasks(uuid),public.assign_salon_staff_task(uuid,uuid,text,text,timestamptz),public.update_my_staff_task(uuid,text)from public,anon;
grant execute on function public.staff_service_catalog(),public.staff_set_service(uuid,uuid,boolean),public.staff_declare_service(uuid,text,text),public.list_staff_service_declarations(uuid),public.list_my_staff_tasks(uuid),public.assign_salon_staff_task(uuid,uuid,text,text,timestamptz),public.update_my_staff_task(uuid,text)to authenticated;
notify pgrst,'reload schema';
commit;
