-- Passage client vers professionnel en conservant le même compte Auth et tout son historique.
create or replace function public.request_provider_onboarding(target_business_name text)
returns void language plpgsql security definer set search_path='' as $$
declare safe_name text:=left(coalesce(nullif(trim(target_business_name),''),'Mata Pro'),120);
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  insert into public.provider_profiles(profile_id,business_name,slug)
  values(auth.uid(),safe_name,'provider-'||replace(left(auth.uid()::text,18),'-','')) on conflict(profile_id) do nothing;
  insert into public.account_roles(profile_id,role) values(auth.uid(),'professional') on conflict do nothing;
  insert into public.professional_onboarding(provider_id) values(auth.uid()) on conflict(provider_id) do nothing;
  insert into public.user_activity_history(profile_id,action) values(auth.uid(),'professional.onboarding_requested');
end; $$;
revoke all on function public.request_provider_onboarding(text) from public,anon;
grant execute on function public.request_provider_onboarding(text) to authenticated;
