-- Remove the editorial duration/ratio caps while preserving private Storage and ownership checks.
-- Recreate the single dependent view inside the migration transaction with its existing ACL/options.
DO $migration$
declare snapshots jsonb := '[]'; policies jsonb := '[]'; view_record record; policy_record record; saved jsonb; grant_record jsonb;
begin
  for view_record in select c.oid,c.relname,c.reloptions,c.relowner from pg_class c
    where c.oid in (to_regclass('public.social_feed'),to_regclass('public.launch_social_feed'))
    order by case when c.relname='social_feed' then 0 else 1 end loop
    snapshots:=snapshots||jsonb_build_array(jsonb_build_object(
      'name',view_record.relname,'definition',pg_get_viewdef(view_record.oid,true),
      'options',array_to_string(view_record.reloptions,','),'owner',pg_get_userbyid(view_record.relowner),
      'comment',obj_description(view_record.oid,'pg_class'),
      'grants',(select jsonb_agg(jsonb_build_object('privilege',a.privilege_type,
        'grantee',case when a.grantee=0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end,'grantable',a.is_grantable))
        from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid=view_record.oid)));
  end loop;
  -- Some installations have RLS policies querying the feed. Preserve their exact
  -- commands, roles, permissiveness and predicates; never disable table RLS.
  for policy_record in select p.*,n.nspname,c.relname from pg_policy p
    join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where p.oid in (select d.objid from pg_depend d where d.classid='pg_policy'::regclass
      and d.refobjid in (to_regclass('public.social_feed'),to_regclass('public.launch_social_feed'))) loop
    policies:=policies||jsonb_build_array(jsonb_build_object(
      'name',policy_record.polname,'schema',policy_record.nspname,'table',policy_record.relname,
      'permissive',policy_record.polpermissive,'command',case policy_record.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
      'roles',(select string_agg(case when role_id=0 then 'public' else quote_ident(pg_get_userbyid(role_id)) end,',') from unnest(policy_record.polroles) role_id),
      'using',pg_get_expr(policy_record.polqual,policy_record.polrelid),
      'check',pg_get_expr(policy_record.polwithcheck,policy_record.polrelid)));
    execute format('drop policy %I on %I.%I',policy_record.polname,policy_record.nspname,policy_record.relname);
  end loop;
  -- No CASCADE: an unexpected dependency stops and rolls back the migration.
  drop view if exists public.launch_social_feed;
  drop view public.social_feed;
  alter table public.posts alter column duration_seconds type numeric;
  alter table public.posts alter column aspect_ratio type numeric;
  alter table public.social_post_media alter column duration_seconds type numeric;
  for saved in select value from jsonb_array_elements(snapshots) loop
    execute format('create view public.%I%s as %s',saved->>'name',
      case when saved->>'options' is null then '' else ' with ('||(saved->>'options')||')' end,saved->>'definition');
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',saved->>'name');
    for grant_record in select value from jsonb_array_elements(coalesce(nullif(saved->'grants','null'::jsonb),'[]')) loop
      execute format('grant %s on public.%I to %s%s',grant_record->>'privilege',saved->>'name',grant_record->>'grantee',
        case when (grant_record->>'grantable')::boolean then ' with grant option' else '' end);
    end loop;
    if saved->>'comment' is not null then execute format('comment on view public.%I is %L',saved->>'name',saved->>'comment'); end if;
    execute format('alter view public.%I owner to %I',saved->>'name',saved->>'owner');
  end loop;
  for saved in select value from jsonb_array_elements(policies) loop
    execute format('create policy %I on %I.%I as %s for %s to %s%s%s',
      saved->>'name',saved->>'schema',saved->>'table',case when (saved->>'permissive')::boolean then 'PERMISSIVE' else 'RESTRICTIVE' end,
      saved->>'command',saved->>'roles',
      case when saved->>'using' is null then '' else ' using ('||(saved->>'using')||')' end,
      case when saved->>'check' is null then '' else ' with check ('||(saved->>'check')||')' end);
  end loop;
end $migration$;

alter table public.posts drop constraint posts_duration_seconds_check;
alter table public.posts add constraint posts_duration_seconds_check check(duration_seconds > 0 and duration_seconds < 'Infinity'::numeric);
alter table public.posts drop constraint posts_aspect_ratio_check;
alter table public.posts add constraint posts_aspect_ratio_check check(aspect_ratio > 0 and aspect_ratio < 'Infinity'::numeric);
alter table public.social_post_media drop constraint social_post_media_duration_seconds_check;
alter table public.social_post_media add constraint social_post_media_duration_seconds_check check(duration_seconds is null or (duration_seconds > 0 and duration_seconds < 'Infinity'::numeric));

-- Keep the current deployed function bodies, signatures, grants and security checks.
-- Fail closed if the expected guard has changed since this release was prepared.
DO $functions$
declare fn record; definition text;
begin
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_provider_video_post','create_video_post') loop
    definition:=pg_get_functiondef(fn.oid);
    if position('target_duration_seconds not between 1 and 90' in definition)=0 then
      if position('target_duration_seconds >= ''Infinity''::numeric' in definition)>0 then continue; end if;
      raise exception 'Unexpected video guard; review migration';
    end if;
    definition:=replace(definition,'target_duration_seconds not between 1 and 90',
      '(target_duration_seconds is null or target_duration_seconds <= 0 or target_duration_seconds >= ''Infinity''::numeric)');
    definition:=replace(definition,'target_aspect_ratio not between 0.4 and 1.8',
      '(target_aspect_ratio is null or target_aspect_ratio <= 0 or target_aspect_ratio >= ''Infinity''::numeric)');
    if position('create_provider_video_post' in definition)>0 then
      definition:=replace(definition,
        'provider_id=auth.uid() and is_active)',
        'provider_id=auth.uid() and archived_at is null and (target_status=''draft'' or is_active))');
    end if;
    execute definition;
  end loop;
end $functions$;
