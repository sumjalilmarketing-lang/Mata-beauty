-- Run only against an isolated local/QA clone after a reviewed migration apply.
-- This file is a test fixture; it does not change schema or data.
do $$
declare
  has_permissions_column boolean;
begin
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='collaborators' and column_name='staff_permissions') into has_permissions_column;
  if has_permissions_column then
    if has_column_privilege('anon','public.collaborators','staff_permissions','select')
      or has_column_privilege('authenticated','public.collaborators','staff_permissions','select')
      or has_column_privilege('anon','public.collaborators','staff_permissions','update')
      or has_column_privilege('authenticated','public.collaborators','staff_permissions','update')
      or has_column_privilege('anon','public.collaborators','staff_permissions','insert')
      or has_column_privilege('authenticated','public.collaborators','staff_permissions','insert') then
      raise exception 'API roles can read or change collaborators.staff_permissions';
    end if;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='collaborators' and column_name='internal_role') then
    raise exception 'Collaborator internal role must live only in the private access table';
  end if;
  if has_column_privilege('anon','public.collaborators','profile_id','select') then
    raise exception 'anon can read collaborator account linkage or role';
  end if;
  if has_column_privilege('anon','public.collaborators','profile_id','update')
    or has_column_privilege('anon','public.collaborators','profile_id','insert') then
    raise exception 'anon can change collaborator account linkage or role';
  end if;
  if has_column_privilege('authenticated','public.collaborators','profile_id','select') then
    raise exception 'authenticated can directly read collaborator account linkage or role';
  end if;
  if has_column_privilege('authenticated','public.collaborators','profile_id','update')
    or has_column_privilege('authenticated','public.collaborators','profile_id','insert') then
    raise exception 'authenticated can change collaborator account linkage or role';
  end if;
  if not has_column_privilege('anon','public.collaborators','display_name','select')
    or not has_column_privilege('authenticated','public.collaborators','display_name','select') then
    raise exception 'Public collaborator presentation fields must remain readable';
  end if;
  if not has_column_privilege('authenticated','public.collaborators','avatar_url','update')
    or has_column_privilege('anon','public.collaborators','avatar_url','update') then
    raise exception 'Only authenticated owner workflows may update public presentation fields';
  end if;
  if has_table_privilege('anon','public.collaborators','insert') or has_table_privilege('anon','public.collaborators','update')
    or has_table_privilege('anon','public.collaborators','delete') or has_table_privilege('anon','public.collaborators','truncate')
    or has_table_privilege('anon','public.collaborators','references') or has_table_privilege('anon','public.collaborators','trigger')
    or has_table_privilege('anon','public.collaborators','maintain') then
    raise exception 'anon retains table-wide collaborator write privileges';
  end if;
  if has_table_privilege('authenticated','public.collaborators','insert') or has_table_privilege('authenticated','public.collaborators','delete')
    or has_table_privilege('authenticated','public.collaborators','truncate') or has_table_privilege('authenticated','public.collaborators','references')
    or has_table_privilege('authenticated','public.collaborators','trigger') or has_table_privilege('authenticated','public.collaborators','maintain') then
    raise exception 'authenticated retains table-wide collaborator write privileges';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='collaborators' and policyname='active collaborators public read' and cmd='SELECT') then
    raise exception 'Public row-filtered collaborator presentation policy must remain';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='collaborators' and policyname='business owners manage collaborators' and cmd='ALL') then
    raise exception 'Owner-scoped collaborator management policy must remain';
  end if;
  if has_schema_privilege('anon','booking_private','usage') or has_schema_privilege('authenticated','booking_private','usage') then
    raise exception 'API roles can resolve the private schema';
  end if;
  if has_function_privilege('anon','public.lookup_business_invitation(text)','execute') or has_function_privilege('authenticated','public.lookup_business_invitation(text)','execute') then
    raise exception 'Invitation lookup is executable outside service_role';
  end if;
  if has_function_privilege('anon','public.accept_business_invitation(uuid,text,uuid)','execute') or has_function_privilege('authenticated','public.accept_business_invitation(uuid,text,uuid)','execute') then
    raise exception 'Invitation acceptance is executable outside service_role';
  end if;
  if not has_function_privilege('authenticated','public.current_collaborator_access()','execute') then
    raise exception 'Authenticated collaborators cannot use the current-user access RPC';
  end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='booking_private' and c.relname='collaborator_access' and c.relrowsecurity) then
    raise exception 'Private collaborator access table must have RLS enabled';
  end if;
  if exists(select 1 from pg_policies where schemaname='booking_private' and tablename in ('collaborator_access','business_invitation_secrets','business_invitation_events')) then
    raise exception 'Private tables must not have API-facing policies';
  end if;
end $$;
