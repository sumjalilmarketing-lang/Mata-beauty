begin;

-- auth.users.email is varchar; the owner-only RPC declares text.
create or replace function public.owner_list_collaborator_access(target_business_id uuid)
returns table(collaborator_id uuid,profile_id uuid,display_name text,email text,internal_role text,permissions text[],revoked_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not booking_private.is_active_business_owner(target_business_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  return query select c.id,c.profile_id,c.display_name,u.email::text,a.internal_role,a.permissions,a.revoked_at
    from booking_private.collaborator_access a join public.collaborators c on c.id=a.collaborator_id
    left join auth.users u on u.id=a.profile_id
    where a.business_id=target_business_id order by c.display_name limit 200;
end;
$$;
revoke all on function public.owner_list_collaborator_access(uuid) from public,anon;
grant execute on function public.owner_list_collaborator_access(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
