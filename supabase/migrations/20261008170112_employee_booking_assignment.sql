begin;

-- Opt-in preserves independent providers and every existing booking.
alter table public.businesses add column team_booking_enabled boolean not null default false;
alter table public.collaborators add column first_name text;
alter table public.collaborators add column public_last_name text;
alter table public.collaborators add column specialties text[] not null default '{}';
alter table public.collaborators add column buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 120);
alter table public.bookings add column collaborator_name text;
alter table public.bookings add column collaborator_avatar_url text;
alter table public.bookings add column resource_busy_until timestamptz;
alter table public.bookings add column assignment_reason text;
alter table public.reviews add column collaborator_id uuid references public.collaborators(id) on delete set null;
alter table public.reviews add column collaborator_name text;

create schema if not exists booking_private;
revoke all on schema booking_private from public,anon,authenticated;

create table public.collaborator_hours (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  weekday smallint not null check(weekday between 0 and 6),
  starts_at time not null, ends_at time not null,
  slot_interval_minutes integer not null default 30 check(slot_interval_minutes between 15 and 180),
  check(starts_at<ends_at), unique(collaborator_id,weekday,starts_at,ends_at)
);
create table public.collaborator_exceptions (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  kind text not null check(kind in ('leave','rest','absence','hours')),
  reason text check(char_length(reason)<=240),
  created_at timestamptz not null default now(),
  check(starts_at<ends_at),
  check(kind<>'hours' or (starts_at at time zone 'Africa/Dakar')::date=(ends_at at time zone 'Africa/Dakar')::date)
);
create index collaborator_exceptions_dates on public.collaborator_exceptions(collaborator_id,starts_at,ends_at);
create table public.booking_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  previous_collaborator_id uuid references public.collaborators(id) on delete set null,
  collaborator_id uuid references public.collaborators(id) on delete set null,
  previous_name text, collaborator_name text,
  reason text, actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index booking_assignments_history on public.booking_assignments(booking_id,created_at);
alter table public.collaborator_hours enable row level security;
alter table public.collaborator_exceptions enable row level security;
alter table public.booking_assignments enable row level security;
revoke all on public.collaborator_hours,public.collaborator_exceptions,public.booking_assignments from anon,authenticated;
grant select,insert,update,delete on public.collaborator_hours,public.collaborator_exceptions to authenticated;
grant select on public.booking_assignments to authenticated;
grant all on public.collaborator_hours,public.collaborator_exceptions,public.booking_assignments to service_role;
create policy "owner manages employee hours" on public.collaborator_hours for all to authenticated
using(exists(select 1 from public.collaborators c join public.businesses b on b.id=c.business_id where c.id=collaborator_id and b.owner_id=auth.uid()))
with check(exists(select 1 from public.collaborators c join public.businesses b on b.id=c.business_id where c.id=collaborator_id and b.owner_id=auth.uid()));
create policy "owner manages employee absences" on public.collaborator_exceptions for all to authenticated
using(exists(select 1 from public.collaborators c join public.businesses b on b.id=c.business_id where c.id=collaborator_id and b.owner_id=auth.uid()))
with check(exists(select 1 from public.collaborators c join public.businesses b on b.id=c.business_id where c.id=collaborator_id and b.owner_id=auth.uid()));
create policy "participants read assignment history" on public.booking_assignments for select to authenticated
using(exists(select 1 from public.bookings b where b.id=booking_id and auth.uid() in (b.client_id,b.provider_id)));

-- Explicit owner checks on RPCs; creating an employee never creates an Auth user
-- or grants an administrative role.
create function booking_private.require_owner(target_business uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  select b.owner_id into owner from public.businesses b join public.profiles p on p.id=b.owner_id
  where b.id=target_business and b.owner_id=auth.uid() and not p.is_suspended and p.account_status='active' and b.archived_at is null;
  if owner is null then raise exception 'Accès équipe refusé' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text,8108));
  return owner;
end $$;

create function booking_private.employee_windows(target_employee uuid,target_day date)
returns table(window_start timestamptz,window_end timestamptz,interval_minutes integer)
language sql stable security definer set search_path='' as $$
  with windows as (
    select (target_day+h.starts_at) at time zone 'Africa/Dakar' as opens,
      (target_day+h.ends_at) at time zone 'Africa/Dakar' as closes,h.slot_interval_minutes as step
    from public.collaborator_hours h where h.collaborator_id=target_employee and h.weekday=extract(dow from target_day)
      and not exists(select 1 from public.collaborator_exceptions x where x.collaborator_id=target_employee and x.kind='hours' and (x.starts_at at time zone 'Africa/Dakar')::date=target_day)
    union all
    select x.starts_at,x.ends_at,30 from public.collaborator_exceptions x
      where x.collaborator_id=target_employee and x.kind='hours' and (x.starts_at at time zone 'Africa/Dakar')::date=target_day
  )
  select greatest(w.opens,coalesce((target_day+h.opens_at) at time zone 'Africa/Dakar',w.opens)),
    least(w.closes,coalesce((target_day+h.closes_at) at time zone 'Africa/Dakar',w.closes)),w.step
  from windows w join public.collaborators c on c.id=target_employee
  left join public.business_hours h on h.business_id=c.business_id and h.weekday=extract(dow from target_day)
  where not coalesce(h.is_closed,false);
$$;

create function booking_private.can_assign(target_service uuid,target_employee uuid,starts timestamptz,ends timestamptz,ignore_booking uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.collaborators c
    join public.businesses business on business.id=c.business_id
    join public.provider_services service on service.id=target_service and service.business_id=business.id and service.provider_id=business.owner_id
    join public.provider_profiles provider on provider.profile_id=service.provider_id
    join public.profiles account on account.id=service.provider_id and not account.is_suspended and account.account_status='active'
    join public.collaborator_services skill on skill.collaborator_id=c.id and skill.provider_service_id=service.id
    where c.id=target_employee and c.is_active and c.is_bookable and c.archived_at is null
      and business.team_booking_enabled and business.is_active and business.archived_at is null and business.status='approved'
      and provider.status='approved' and service.is_active and coalesce(to_jsonb(service)->>'status','published')='published' and service.archived_at is null
      and starts>now() and starts<now()+interval '1 year' and ends>starts
      and exists(select 1 from booking_private.employee_windows(c.id,(starts at time zone 'Africa/Dakar')::date) w
        where starts>=w.window_start and ends+make_interval(mins=>c.buffer_minutes)<=w.window_end
          and mod(extract(epoch from starts-w.window_start)::numeric, w.interval_minutes*60)=0)
      and not exists(select 1 from public.collaborator_exceptions x where x.collaborator_id=c.id and x.kind<>'hours'
        and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(starts,ends+make_interval(mins=>c.buffer_minutes),'[)'))
      and not exists(select 1 from public.business_closures x where x.business_id=business.id
        and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(starts,ends+make_interval(mins=>c.buffer_minutes),'[)'))
      and not exists(select 1 from public.bookings b where b.provider_id=service.provider_id
        and (ignore_booking is null or b.id<>ignore_booking) and (b.collaborator_id=c.id or b.collaborator_id is null)
        and b.status in ('pending','confirmed','in_progress')
        and tstzrange(b.starts_at,coalesce(b.resource_busy_until,b.ends_at),'[)') && tstzrange(starts,ends+make_interval(mins=>c.buffer_minutes),'[)'))
  );
$$;

create function public.get_team_available_slots(target_provider_service_id uuid,from_date date default current_date,days integer default 1)
returns table(slot_start timestamptz,collaborator_id uuid,display_name text,title text,avatar_url text,specialties text[])
language sql stable security definer set search_path='' as $$
  select distinct slot.start_at,c.id,c.display_name,c.title,c.avatar_url,c.specialties
  from public.provider_services s join public.collaborator_services skill on skill.provider_service_id=s.id
  join public.collaborators c on c.id=skill.collaborator_id
  cross join generate_series(from_date,from_date+greatest(0,least(days,31)-1),interval '1 day') d
  cross join lateral booking_private.employee_windows(c.id,d::date) w
  cross join lateral generate_series(w.window_start,w.window_end-make_interval(mins=>s.duration_minutes+c.buffer_minutes),make_interval(mins=>w.interval_minutes)) slot(start_at)
  where s.id=target_provider_service_id and booking_private.can_assign(s.id,c.id,slot.start_at,slot.start_at+make_interval(mins=>s.duration_minutes))
  order by slot.start_at,c.id limit 4000;
$$;
revoke all on function public.get_team_available_slots(uuid,date,integer) from public;
grant execute on function public.get_team_available_slots(uuid,date,integer) to anon,authenticated,service_role;

-- Keep the deployed independent-provider slot calculation byte-for-byte.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.get_available_slots(uuid,uuid,date,integer)'::regprocedure);
  execute replace(definition,'FUNCTION public.get_available_slots(', 'FUNCTION booking_private.independent_slots(');
end $$;
create or replace function public.get_available_slots(target_provider_id uuid,target_provider_service_id uuid,from_date date default current_date,days integer default 14)
returns table(slot_start timestamptz) language plpgsql stable security definer set search_path='' as $$
begin
  if exists(select 1 from public.provider_services s join public.businesses b on b.id=s.business_id
    where s.id=target_provider_service_id and s.provider_id=target_provider_id and b.team_booking_enabled) then
    return query select distinct t.slot_start from public.get_team_available_slots(target_provider_service_id,from_date,days) t order by t.slot_start;
  else
    return query select * from booking_private.independent_slots(target_provider_id,target_provider_service_id,from_date,days);
  end if;
end $$;
create function public.get_booking_team_availability(target_service_id uuid,from_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare service public.provider_services%rowtype; enabled boolean; slots jsonb;
begin
  select s.* into service from public.provider_services s join public.provider_profiles p on p.profile_id=s.provider_id
    where s.id=target_service_id and coalesce(to_jsonb(s)->>'status','published')='published' and s.is_active and s.archived_at is null and p.status='approved';
  if service.id is null then return jsonb_build_object('teamEnabled',false,'slots','[]'::jsonb); end if;
  select b.team_booking_enabled into enabled from public.businesses b where b.id=service.business_id;
  if coalesce(enabled,false) then select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into slots from public.get_team_available_slots(service.id,from_date,1) t;
  else select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into slots from public.get_available_slots(service.provider_id,service.id,from_date,1) t; end if;
  return jsonb_build_object('teamEnabled',coalesce(enabled,false),'slots',slots);
end $$;
revoke all on function public.get_booking_team_availability(uuid,date) from public;
grant execute on function public.get_booking_team_availability(uuid,date) to anon,authenticated,service_role;

-- Serialize booking/assignment decisions with employee calendar edits. The
-- exclusion constraint remains the final concurrency barrier for every writer.
create function booking_private.lock_booking_resource() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  select provider_id into owner from public.provider_services where id=new.provider_service_id;
  if owner is not null then perform pg_advisory_xact_lock(hashtextextended(owner::text,8108)); end if;
  return new;
end $$;
create trigger bookings_aa_resource_lock before insert or update on public.bookings for each row execute function booking_private.lock_booking_resource();
alter table public.bookings drop constraint bookings_no_active_overlap;
alter table public.bookings add constraint bookings_no_active_resource_overlap exclude using gist (
  (coalesce(collaborator_id,provider_id)) with =,
  tstzrange(starts_at,coalesce(resource_busy_until,ends_at),'[)') with &&
) where(status in ('pending','confirmed','in_progress'));

create or replace function public.enforce_salon_booking_contract() returns trigger
language plpgsql security definer set search_path='' as $$
declare business uuid; enabled boolean; person public.collaborators%rowtype;
begin
  select s.business_id,b.team_booking_enabled into business,enabled from public.provider_services s left join public.businesses b on b.id=s.business_id where s.id=new.provider_service_id;
  new.business_id:=business;
  if coalesce(enabled,false) then
    if new.collaborator_id is null then
      select c.* into person from public.collaborators c
      where c.business_id=business and booking_private.can_assign(new.provider_service_id,c.id,new.starts_at,new.ends_at)
      order by (select max(b.created_at) from public.bookings b where b.collaborator_id=c.id and b.status not in ('declined','cancelled_by_client','cancelled_by_provider')) nulls first,c.id limit 1;
    else select * into person from public.collaborators c where c.id=new.collaborator_id and booking_private.can_assign(new.provider_service_id,c.id,new.starts_at,new.ends_at); end if;
    if person.id is null then raise exception 'Aucun collaborateur qualifié et disponible sur ce créneau' using errcode='23P01'; end if;
    new.collaborator_id:=person.id;
  elsif new.collaborator_id is not null then
    select * into person from public.collaborators c where c.id=new.collaborator_id and c.business_id=business and c.is_active and c.is_bookable and c.archived_at is null;
    if person.id is null then raise exception 'Collaborateur indisponible pour cette prestation'; end if;
  end if;
  new.collaborator_name:=person.display_name; new.collaborator_avatar_url:=person.avatar_url;
  new.resource_busy_until:=new.ends_at+make_interval(mins=>coalesce(person.buffer_minutes,0));
  new.assignment_reason:=null;
  return new;
end $$;

create or replace function public.protect_salon_booking_contract() returns trigger
language plpgsql security definer set search_path='' as $$
declare person public.collaborators%rowtype;
begin
  if new.business_id is distinct from old.business_id then raise exception 'Salon contractuel immuable'; end if;
  if new.collaborator_id is distinct from old.collaborator_id then
    if auth.uid() is distinct from old.provider_id or old.status not in ('pending','confirmed') or old.starts_at<=now() then
      raise exception 'Réaffectation interdite' using errcode='42501'; end if;
    if nullif(trim(new.assignment_reason),'') is null then raise exception 'Motif de réaffectation obligatoire'; end if;
    select * into person from public.collaborators c where c.id=new.collaborator_id
      and booking_private.can_assign(old.provider_service_id,c.id,old.starts_at,old.ends_at,old.id);
    if person.id is null then raise exception 'Collaborateur non qualifié ou créneau indisponible' using errcode='23P01'; end if;
    new.collaborator_name:=person.display_name; new.collaborator_avatar_url:=person.avatar_url;
    new.resource_busy_until:=new.ends_at+make_interval(mins=>person.buffer_minutes);
  else
    new.collaborator_name:=old.collaborator_name; new.collaborator_avatar_url:=old.collaborator_avatar_url;
    new.resource_busy_until:=case when new.ends_at=old.ends_at then old.resource_busy_until else new.ends_at+coalesce(old.resource_busy_until-old.ends_at,interval '0') end;
    new.assignment_reason:=old.assignment_reason;
  end if;
  return new;
end $$;
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.validate_booking_update()'::regprocedure);
  if position('transition_allowed := case old.status' in definition)>0 then
    execute replace(definition,'transition_allowed := case old.status',
      'if auth.uid()=old.provider_id and new.status=old.status and new.collaborator_id is distinct from old.collaborator_id then return new; end if;
  transition_allowed := case old.status');
  elsif position('elsif auth.uid() = old.provider_id then' in definition)>0 then
    execute replace(definition,'elsif auth.uid() = old.provider_id then', 'elsif auth.uid() = old.provider_id then
      if new.status=old.status and new.collaborator_id is distinct from old.collaborator_id then return new; end if;');
  else raise exception 'Booking validation contract changed; manual review required'; end if;
end $$;

create function public.reassign_booking_collaborator(target_booking_id uuid,target_collaborator_id uuid,reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare booking public.bookings%rowtype;
begin
  select * into booking from public.bookings where id=target_booking_id;
  if booking.id is null or auth.uid() is distinct from booking.provider_id then raise exception 'Accès refusé' using errcode='42501'; end if;
  perform booking_private.require_owner(booking.business_id);
  select * into booking from public.bookings where id=target_booking_id for update;
  if booking.collaborator_id=target_collaborator_id then return jsonb_build_object('id',booking.id,'changed',false); end if;
  if reason is null or char_length(trim(reason)) not between 3 and 240 then raise exception 'Motif requis (3 à 240 caractères)'; end if;
  update public.bookings set collaborator_id=target_collaborator_id,assignment_reason=trim(reason) where id=booking.id;
  return jsonb_build_object('id',booking.id,'changed',true);
end $$;
revoke all on function public.reassign_booking_collaborator(uuid,uuid,text) from public,anon;
grant execute on function public.reassign_booking_collaborator(uuid,uuid,text) to authenticated;

create function public.get_reassignment_candidates(target_booking_id uuid)
returns table(id uuid,display_name text,avatar_url text)
language plpgsql stable security definer set search_path='' as $$
declare booking public.bookings%rowtype;
begin
  select * into booking from public.bookings b where b.id=target_booking_id and b.provider_id=auth.uid();
  if booking.id is null then raise exception 'Accès refusé' using errcode='42501'; end if;
  return query select c.id,c.display_name,c.avatar_url from public.collaborators c
    where c.business_id=booking.business_id and booking_private.can_assign(booking.provider_service_id,c.id,booking.starts_at,booking.ends_at,booking.id) order by c.display_name;
end $$;
revoke all on function public.get_reassignment_candidates(uuid) from public,anon;
grant execute on function public.get_reassignment_candidates(uuid) to authenticated;

create function booking_private.record_assignment() returns trigger language plpgsql security definer set search_path='' as $$
declare previous_id uuid; previous_name text; employee_profile uuid; message text;
begin
  if tg_op='UPDATE' then
    if new.collaborator_id is not distinct from old.collaborator_id then return new; end if;
    previous_id:=old.collaborator_id; previous_name:=old.collaborator_name;
  elsif new.collaborator_id is null then return new; end if;
  insert into public.booking_assignments(booking_id,previous_collaborator_id,collaborator_id,previous_name,collaborator_name,reason,actor_id)
    values(new.id,previous_id,new.collaborator_id,previous_name,new.collaborator_name,new.assignment_reason,auth.uid());
  message:='Votre rendez-vous sera assuré par '||new.collaborator_name||'. '||to_char(new.starts_at at time zone 'Africa/Dakar','DD/MM/YYYY à HH24:MI')||case when new.status='pending' then ' — demande en attente de confirmation.' else '.' end;
  insert into public.notifications(profile_id,kind,title,body,data) values(new.client_id,'booking_assignment','Votre professionnel',message,jsonb_build_object('booking_id',new.id,'collaborator_id',new.collaborator_id,'href','/app/bookings#booking-'||new.id));
  if tg_op='UPDATE' then insert into public.notifications(profile_id,kind,title,body,data) values(new.provider_id,'booking_assignment','Affectation mise à jour',message,jsonb_build_object('booking_id',new.id,'href','/pro/bookings#booking-'||new.id)); end if;
  select c.profile_id into employee_profile from public.collaborators c where c.id=new.collaborator_id and c.is_active and c.archived_at is null;
  if employee_profile is not null and employee_profile not in (new.client_id,new.provider_id) then
    insert into public.notifications(profile_id,kind,title,body,data) values(employee_profile,'booking_assignment','Nouvelle prestation prévue',message,jsonb_build_object('booking_id',new.id,'href','/staff/bookings#booking-'||new.id));
  end if;
  return new;
end $$;
create trigger bookings_assignment_recorded after insert or update of collaborator_id on public.bookings for each row execute function booking_private.record_assignment();

-- Enrich existing notifications, rather than duplicating reservation events.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.notify_booking_created()'::regprocedure);
  execute replace(definition,'''Une nouvelle réservation attend votre réponse.''',
    'case when new.collaborator_name is null then ''Une nouvelle réservation attend votre réponse.'' else ''Nouvelle réservation attribuée à ''||new.collaborator_name||''. En attente de votre confirmation.'' end');
  definition:=pg_get_functiondef('public.notify_booking_status_changed()'::regprocedure);
  execute replace(definition,'insert into public.notifications',
    'if new.collaborator_name is not null then event_body:=event_body||'' Professionnel : ''||new.collaborator_name||''.''; end if;
  insert into public.notifications');
  definition:=pg_get_functiondef('public.queue_transactional_notification()'::regprocedure);
  if position('''booking_status_changed''' in definition)=0 then raise exception 'Email dispatch contract changed'; end if;
  execute replace(definition,'''booking_status_changed''','''booking_status_changed'',''booking_assignment''');
end $$;

create function booking_private.review_performer() returns trigger language plpgsql security definer set search_path='' as $$
declare booking public.bookings%rowtype;
begin
  if tg_op='UPDATE' then new.collaborator_id:=old.collaborator_id; new.collaborator_name:=old.collaborator_name;
  else
    select * into booking from public.bookings where id=new.booking_id and status='completed';
    if booking.id is null then raise exception 'Un avis vérifié exige une prestation terminée'; end if;
    new.collaborator_id:=booking.collaborator_id; new.collaborator_name:=booking.collaborator_name;
  end if;
  return new;
end $$;
create trigger reviews_aa_performer before insert or update on public.reviews for each row execute function booking_private.review_performer();

-- Calendar changes never silently cancel existing appointments. They alert the
-- owner and remain visible as conflicts in the team agenda.
create function booking_private.calendar_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare employee uuid; owner uuid; affected integer;
begin
  if tg_table_name='collaborators' then employee:=coalesce(new.id,old.id);
  else employee:=coalesce(new.collaborator_id,old.collaborator_id); end if;
  select b.owner_id into owner from public.collaborators c join public.businesses b on b.id=c.business_id where c.id=employee;
  if owner is not null then perform pg_advisory_xact_lock(hashtextextended(owner::text,8108)); end if;
  if tg_when='AFTER' then
    select count(*) into affected from public.bookings b where b.collaborator_id=employee and b.starts_at>now() and b.status in ('pending','confirmed')
      and not booking_private.can_assign(b.provider_service_id,employee,b.starts_at,b.ends_at,b.id);
    if affected>0 then insert into public.notifications(profile_id,kind,title,body,data)
      values(owner,'team_availability','Réaffectation à vérifier',affected||' rendez-vous existant(s) à vérifier après une modification des disponibilités.','{"href":"/pro/team"}'::jsonb); end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger collaborator_hours_lock before insert or update or delete on public.collaborator_hours for each row execute function booking_private.calendar_changed();
create trigger collaborator_hours_alert after insert or update or delete on public.collaborator_hours for each row execute function booking_private.calendar_changed();
create trigger collaborator_exceptions_lock before insert or update or delete on public.collaborator_exceptions for each row execute function booking_private.calendar_changed();
create trigger collaborator_exceptions_alert after insert or update or delete on public.collaborator_exceptions for each row execute function booking_private.calendar_changed();
create trigger collaborators_calendar_lock before update on public.collaborators for each row execute function booking_private.calendar_changed();
create trigger collaborators_calendar_alert after update of is_active,is_bookable,archived_at,buffer_minutes on public.collaborators for each row execute function booking_private.calendar_changed();

create function public.save_team_member(target_business_id uuid,target_member_id uuid,member jsonb,service_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid; selected_id uuid; first text; last text;
begin
  owner:=booking_private.require_owner(target_business_id);
  first:=trim(member->>'first_name'); last:=trim(coalesce(member->>'public_last_name',''));
  if first is null or char_length(first) not between 1 and 50 or char_length(first||' '||last)>100 then raise exception 'Prénom et nom public invalides'; end if;
  if jsonb_typeof(coalesce(member->'specialties','[]'::jsonb))<>'array' then raise exception 'Spécialités invalides'; end if;
  if jsonb_array_length(coalesce(member->'specialties','[]'::jsonb))>20
    or exists(select 1 from jsonb_array_elements_text(coalesce(member->'specialties','[]'::jsonb)) value where char_length(value)>100)
    or char_length(member->>'title')>100 then raise exception 'Informations professionnelles trop longues'; end if;
  if exists(select 1 from unnest(service_ids) requested(id) left join public.provider_services s on s.id=requested.id
    where s.id is null or s.provider_id<>owner or (s.business_id is not null and s.business_id<>target_business_id)) then raise exception 'Prestation extérieure à votre salon' using errcode='42501'; end if;
  if target_member_id is null then
    insert into public.collaborators(business_id,display_name,first_name,public_last_name,title,specialties,buffer_minutes,is_bookable)
    values(target_business_id,trim(first||' '||last),first,last,nullif(trim(member->>'title'),''),array(select jsonb_array_elements_text(coalesce(member->'specialties','[]'))),coalesce((member->>'buffer_minutes')::integer,0),coalesce((member->>'is_bookable')::boolean,true)) returning id into selected_id;
  else
    update public.collaborators set display_name=trim(first||' '||last),first_name=first,public_last_name=last,title=nullif(trim(member->>'title'),''),
      specialties=array(select jsonb_array_elements_text(coalesce(member->'specialties','[]'))),buffer_minutes=coalesce((member->>'buffer_minutes')::integer,0),is_bookable=coalesce((member->>'is_bookable')::boolean,true)
      where id=target_member_id and business_id=target_business_id and archived_at is null returning id into selected_id;
    if selected_id is null then raise exception 'Collaborateur inaccessible' using errcode='42501'; end if;
  end if;
  update public.provider_services set business_id=target_business_id where id=any(service_ids) and business_id is null;
  delete from public.collaborator_services where collaborator_id=selected_id;
  insert into public.collaborator_services(collaborator_id,provider_service_id) select selected_id,id from unnest(service_ids) ids(id) on conflict do nothing;
  return selected_id;
end $$;
revoke all on function public.save_team_member(uuid,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.save_team_member(uuid,uuid,jsonb,uuid[]) to authenticated;

create function public.set_team_booking_enabled(target_business_id uuid,enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform booking_private.require_owner(target_business_id);
  if enabled and not exists(select 1 from public.collaborators c join public.collaborator_services s on s.collaborator_id=c.id join public.collaborator_hours h on h.collaborator_id=c.id
    where c.business_id=target_business_id and c.is_active and c.is_bookable and c.archived_at is null) then raise exception 'Configurez au moins un collaborateur, ses prestations et ses horaires'; end if;
  update public.businesses set team_booking_enabled=enabled where id=target_business_id;
end $$;
revoke all on function public.set_team_booking_enabled(uuid,boolean) from public,anon;
grant execute on function public.set_team_booking_enabled(uuid,boolean) to authenticated;

create function public.get_team_agenda(target_business_id uuid,from_date date default current_date,days integer default 31)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.businesses where id=target_business_id and owner_id=auth.uid()) then raise exception 'Accès refusé' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(item)) from (
    select b.id,b.starts_at,b.ends_at,b.status,b.collaborator_id,b.collaborator_name,b.provider_service_id,s.title as service_title,
      coalesce(nullif(p.display_name,''),nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),''),'Client') as client_name,
      case when b.collaborator_id is not null and b.starts_at>now() and b.status in ('pending','confirmed') then not booking_private.can_assign(b.provider_service_id,b.collaborator_id,b.starts_at,b.ends_at,b.id) else false end as assignment_conflict
    from public.bookings b join public.provider_services s on s.id=b.provider_service_id join public.profiles p on p.id=b.client_id
    where b.business_id=target_business_id and b.starts_at>=(from_date::timestamp at time zone 'Africa/Dakar')
      and b.starts_at<((from_date+greatest(1,least(days,93)))::timestamp at time zone 'Africa/Dakar') order by b.starts_at,b.id limit 500
  ) item),'[]'::jsonb);
end $$;
revoke all on function public.get_team_agenda(uuid,date,integer) from public,anon;
grant execute on function public.get_team_agenda(uuid,date,integer) to authenticated;

-- Enforce qualification scope even for direct Data API writes.
create function booking_private.guard_qualification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.collaborators c join public.businesses b on b.id=c.business_id
    join public.provider_services s on s.id=new.provider_service_id and s.provider_id=b.owner_id and s.business_id=b.id
    where c.id=new.collaborator_id) then
    raise exception 'Prestation extérieure au salon du collaborateur' using errcode='23514';
  end if;
  return new;
end $$;
create trigger collaborator_services_scope before insert or update on public.collaborator_services
for each row execute function booking_private.guard_qualification();

-- The activation prerequisite also applies to direct table updates.
create function booking_private.guard_team_activation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.team_booking_enabled and (tg_op='INSERT' or not old.team_booking_enabled) and not exists(
    select 1 from public.collaborators c join public.collaborator_services s on s.collaborator_id=c.id
    join public.collaborator_hours h on h.collaborator_id=c.id
    where c.business_id=new.id and c.is_active and c.is_bookable and c.archived_at is null
  ) then raise exception 'Configurez au moins un collaborateur, ses prestations et ses horaires'; end if;
  return new;
end $$;
create trigger businesses_team_activation before insert or update of team_booking_enabled on public.businesses
for each row execute function booking_private.guard_team_activation();

revoke all on all functions in schema booking_private from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
