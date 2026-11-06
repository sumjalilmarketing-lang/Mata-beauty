begin;
-- Authenticated callers receive only their own scalar counters.
create function public.my_unread_inbox_counts()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'messages',case when exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and not p.is_suspended) then
   (select count(*) from public.conversation_members member join public.messages m on m.conversation_id=member.conversation_id
    where member.profile_id=auth.uid() and public.is_conversation_member(member.conversation_id)
      and m.sender_id<>auth.uid() and m.deleted_at is null and m.created_at>coalesce(member.last_read_at,'-infinity'::timestamptz)) else 0 end,
  'notifications',(select count(*) from public.notifications n where n.profile_id=auth.uid() and n.read_at is null and n.dismissed_at is null));
$$;
revoke all on function public.my_unread_inbox_counts() from public,anon;
grant execute on function public.my_unread_inbox_counts() to authenticated;
-- Keep the public professional identity aligned when its only salon is renamed.
create function public.sync_single_salon_public_name()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (select count(*) from public.businesses b where b.owner_id=new.owner_id and b.archived_at is null)=1 then
  update public.provider_profiles set business_name=new.name where profile_id=new.owner_id;
 end if;
 return new;
end $$;
revoke all on function public.sync_single_salon_public_name() from public,anon,authenticated;
create trigger businesses_sync_public_name after update of name on public.businesses
 for each row when(old.name is distinct from new.name) execute function public.sync_single_salon_public_name();
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
  if service.business_id is not null and not exists(select 1 from public.businesses b
    where b.id=service.business_id and b.owner_id=service.provider_id and b.status='approved' and b.is_active and b.archived_at is null) then
    return jsonb_build_object('teamEnabled',false,'people',people,'slots','[]'::jsonb,'blockedReason','salon_not_published');
  end if;
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
