begin;
create or replace function public.get_collaborator_team_photos(target_business_id uuid)
returns table(collaborator_id uuid,avatar_url text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (booking_private.is_active_business_owner(target_business_id) or exists(select 1 from public.current_collaborator_access() a where a.business_id=target_business_id)) then
  raise exception 'Accès refusé' using errcode='42501';
 end if;
 return query select c.id,coalesce(nullif(p.avatar_url,''),nullif(c.avatar_url,''))
 from public.collaborators c left join public.profiles p on p.id=c.profile_id
 where c.business_id=target_business_id and c.archived_at is null;
end $$;
revoke all on function public.get_collaborator_team_photos(uuid) from public,anon;
grant execute on function public.get_collaborator_team_photos(uuid) to authenticated;
commit;
