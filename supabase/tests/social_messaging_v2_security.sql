-- Run only against an isolated local Supabase/PostgreSQL test database after
-- applying the three V2 migrations. No fixture data or remote access is needed.
do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.professional_stories'::regclass) then
    raise exception 'professional_stories RLS is disabled';
  end if;
  if has_column_privilege('anon','public.professional_stories','storage_path','select')
    or has_column_privilege('authenticated','public.professional_stories','storage_path','select') then
    raise exception 'private Story storage path is exposed';
  end if;
  if not has_column_privilege('anon','public.professional_stories','caption','select') then
    raise exception 'public Story metadata cannot be read';
  end if;
  if (select public from storage.buckets where id='professional-stories') is distinct from false then
    raise exception 'Story bucket must remain private';
  end if;
  if has_function_privilege('anon','public.list_active_professional_stories(integer)','execute')
    or has_function_privilege('authenticated','public.list_active_professional_stories(integer)','execute') then
    raise exception 'private Story URL listing RPC is exposed';
  end if;
  if has_function_privilege('anon','public.respond_to_message_request(uuid,boolean)','execute')
    or not has_function_privilege('authenticated','public.respond_to_message_request(uuid,boolean)','execute') then
    raise exception 'message request decision grants are incorrect';
  end if;
  if has_function_privilege('anon','public.owner_assign_conversation(uuid,uuid)','execute')
    or not has_function_privilege('authenticated','public.owner_assign_conversation(uuid,uuid)','execute') then
    raise exception 'assignment RPC grants are incorrect';
  end if;
end $$;
