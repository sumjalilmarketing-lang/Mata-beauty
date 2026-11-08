begin;
set local lock_timeout='5s';
-- Storage probes user RLS first, then commits the upload as service_role.
-- The finalizer has no user sub; retain the verified object owner's identity.
create or replace function media_security.guard_studio_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; caller uuid := auth.uid();
begin
 if new.bucket_id<>'studio-video-inputs' then return new; end if;
 if caller is null and current_setting('role',true) is distinct from 'service_role' then
   raise exception 'Storage authorization context required' using errcode='42501';
 end if;
 if new.owner_id is null or new.owner_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception 'Storage owner required' using errcode='42501';
 end if;
 actor:=new.owner_id::uuid;
 if caller is not null and caller<>actor then
   raise exception 'Storage owner mismatch' using errcode='42501';
 end if;
 if new.name !~ ('^'||actor::text||'/[0-9a-f-]{36}/input$') then
   raise exception 'Studio source path invalid' using errcode='42501';
 end if;
 if not exists(select 1 from public.provider_profiles p join public.profiles a on a.id=p.profile_id where p.profile_id=actor and not a.is_suspended and a.account_status='active') then
   raise exception 'Active professional account required' using errcode='42501';
 end if;
 if not public.consume_financial_rate_limit('studio_source_upload',md5(actor::text),10,3600) then
   raise exception 'Studio upload limit reached' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function media_security.guard_studio_source() from public,anon,authenticated;
commit;
