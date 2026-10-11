begin;
-- A set-returning function with one OUT column aliases to its scalar value in
-- to_jsonb(t). Always return the same slot_start object contract as the team branch.
create or replace function public.get_booking_team_availability(target_service_id uuid,from_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare service public.provider_services%rowtype; enabled boolean; slots jsonb;
begin
  select s.* into service from public.provider_services s join public.provider_profiles p on p.profile_id=s.provider_id
    where s.id=target_service_id and coalesce(to_jsonb(s)->>'status','published')='published' and s.is_active and s.archived_at is null and p.status='approved';
  if service.id is null then return jsonb_build_object('teamEnabled',false,'slots','[]'::jsonb); end if;
  select b.team_booking_enabled into enabled from public.businesses b where b.id=service.business_id;
  if coalesce(enabled,false) then
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into slots from public.get_team_available_slots(service.id,from_date,1) t;
  else
    select coalesce(jsonb_agg(jsonb_build_object('slot_start',t.slot_start)),'[]'::jsonb) into slots from public.get_available_slots(service.provider_id,service.id,from_date,1) t;
  end if;
  return jsonb_build_object('teamEnabled',coalesce(enabled,false),'slots',slots);
end $$;
revoke all on function public.get_booking_team_availability(uuid,date) from public;
grant execute on function public.get_booking_team_availability(uuid,date) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
