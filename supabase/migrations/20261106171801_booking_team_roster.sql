begin;
-- A public, service-qualified roster must not disappear when a day is full.
-- Only names, public photos and specialties are returned; no private agenda.
create or replace function public.get_booking_team_availability(target_service_id uuid,from_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare service public.provider_services%rowtype; enabled boolean; slots jsonb; people jsonb := '[]'::jsonb;
begin
  select s.* into service from public.provider_services s
    join public.provider_profiles p on p.profile_id=s.provider_id
    join public.profiles account on account.id=p.profile_id
    where s.id=target_service_id and coalesce(to_jsonb(s)->>'status','published')='published'
      and s.is_active and s.archived_at is null and p.status='approved'
      and account.account_status='active' and not account.is_suspended;
  if service.id is null then return jsonb_build_object('teamEnabled',false,'people',people,'slots','[]'::jsonb); end if;
  select b.team_booking_enabled into enabled from public.businesses b
    where b.id=service.business_id and b.owner_id=service.provider_id
      and b.is_active and b.archived_at is null and b.status='approved';
  if coalesce(enabled,false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'collaborator_id',c.id,'display_name',c.display_name,'title',c.title,
      'avatar_url',coalesce(nullif(photo.avatar_url,''),c.avatar_url),'specialties',c.specialties
    ) order by c.display_name,c.id),'[]'::jsonb) into people
    from public.collaborators c
    join public.collaborator_services skill on skill.collaborator_id=c.id and skill.provider_service_id=service.id
    left join public.profiles photo on photo.id=c.profile_id
    where c.business_id=service.business_id and c.is_active and c.is_bookable and c.archived_at is null;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into slots
      from public.get_team_available_slots(service.id,from_date,1) t;
  else
    select coalesce(jsonb_agg(jsonb_build_object('slot_start',t.slot_start)),'[]'::jsonb) into slots
      from public.get_available_slots(service.provider_id,service.id,from_date,1) t;
  end if;
  return jsonb_build_object('teamEnabled',coalesce(enabled,false),'people',people,'slots',slots);
end $$;
revoke all on function public.get_booking_team_availability(uuid,date) from public,anon,authenticated;
grant execute on function public.get_booking_team_availability(uuid,date) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
