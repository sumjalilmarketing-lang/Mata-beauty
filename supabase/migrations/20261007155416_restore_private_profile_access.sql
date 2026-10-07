-- Session-bound private projection. No caller-supplied identifier is accepted.
create or replace function public.get_my_private_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select to_jsonb(profile) into result from public.profiles profile where profile.id=auth.uid();
  return result;
end;
$$;
revoke all on function public.get_my_private_profile() from public,anon;
grant execute on function public.get_my_private_profile() to authenticated;
