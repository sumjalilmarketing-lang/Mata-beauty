begin;

-- Required options are part of the actual duration in production. QA's older
-- catalog has no options table; keep its independent contract unchanged.
create function booking_private.default_service_duration(target_service uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare duration integer; additional integer:=0;
begin
  select duration_minutes into duration from public.provider_services where id=target_service;
  if to_regclass('public.service_options') is not null then
    execute 'select coalesce(sum(duration_minutes),0)::integer from public.service_options where provider_service_id=$1 and is_active and is_required'
      into additional using target_service;
  end if;
  return duration+additional;
end $$;
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.get_team_available_slots(uuid,date,integer)'::regprocedure);
  execute replace(definition,'s.duration_minutes','booking_private.default_service_duration(s.id)');
end $$;

-- Direct calendar writes must also reject inactive accounts, not only RPCs.
create function booking_private.require_active_editor() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and not exists(select 1 from public.profiles p
    where p.id=auth.uid() and not p.is_suspended and p.account_status='active') then
    raise exception 'Compte actif requis' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger collaborator_hours_active_editor before insert or update or delete on public.collaborator_hours
for each row execute function booking_private.require_active_editor();
create trigger collaborator_exceptions_active_editor before insert or update or delete on public.collaborator_exceptions
for each row execute function booking_private.require_active_editor();
create trigger collaborator_services_active_editor before insert or update or delete on public.collaborator_services
for each row execute function booking_private.require_active_editor();

revoke all on all functions in schema booking_private from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
