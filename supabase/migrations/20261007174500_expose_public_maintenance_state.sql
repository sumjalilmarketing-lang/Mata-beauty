-- Only public operational state is exposed, never the other application settings.
create or replace function public.get_public_maintenance_state()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object(
   'enabled',coalesce(value->'enabled','false'::jsonb)='true'::jsonb,
   'message',left(coalesce(nullif(value->>'message',''),'MATA Beauty revient très vite.'),500))
 from public.app_settings where key='maintenance'),
 jsonb_build_object('enabled',false,'message','MATA Beauty revient très vite.'));
$$;
revoke all on function public.get_public_maintenance_state() from public;
grant execute on function public.get_public_maintenance_state() to anon,authenticated;
