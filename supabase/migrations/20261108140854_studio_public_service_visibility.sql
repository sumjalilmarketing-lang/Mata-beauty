-- A public post is not a publication of the associated commercial service.
-- Keep service RLS and expose booking details only for a bookable public service.
do $migration$
declare definition text; original text;
begin
  perform set_config('search_path','public,pg_catalog',true);
  original := pg_get_viewdef('public.social_feed'::regclass,true);
  definition := replace(original,'ps.provider_service_id,','svc.id AS provider_service_id,');
  definition := replace(definition,
    'JOIN provider_services svc ON svc.id = ps.provider_service_id AND svc.is_active',
    'LEFT JOIN provider_services svc ON svc.id = ps.provider_service_id AND svc.status = ''published'' AND svc.is_active AND svc.archived_at IS NULL');
  definition := replace(definition,
    'p.status = ''published''::text AND p.visibility = ''public''::text',
    'p.status = ''published''::text AND p.visibility = ''public''::text AND p.published_at IS NOT NULL AND p.published_at <= now()');
  if definition = original
    or position('svc.id AS provider_service_id,' in definition)=0
    or position('LEFT JOIN provider_services svc' in definition)=0
    or position('svc.archived_at IS NULL' in definition)=0
    or position('p.published_at <= now()' in definition)=0 then
    raise exception 'Unexpected social_feed definition; review migration';
  end if;
  -- REPLACE preserves the view's existing grants and dependent views.
  execute 'create or replace view public.social_feed with (security_invoker=true) as ' || definition;

  original := pg_get_functiondef('public.is_public_social_post(uuid)'::regprocedure);
  definition := replace(original,' and service.is_active','');
  if definition = original then
    raise exception 'Unexpected public post media predicate; review migration';
  end if;
  -- Preserve all existing ACLs and other moderation, author and date checks.
  execute definition;
end $migration$;
