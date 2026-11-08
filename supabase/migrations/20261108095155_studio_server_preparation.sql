begin;
set local lock_timeout='5s';
-- Sources are never public or attached to the feed. No MIME declaration is trusted.
insert into storage.buckets(id,name,public,file_size_limit) values('studio-video-inputs','studio-video-inputs',false,104857600)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
create policy "Studio source owner read" on storage.objects for select to authenticated
using(bucket_id='studio-video-inputs' and owner_id=auth.uid()::text and split_part(name,'/',1)=auth.uid()::text);
create policy "Studio source owner insert" on storage.objects for insert to authenticated
with check(bucket_id='studio-video-inputs' and split_part(name,'/',1)=auth.uid()::text and exists(select 1 from public.provider_profiles where profile_id=auth.uid()));
create policy "Studio source owner delete" on storage.objects for delete to authenticated
using(bucket_id='studio-video-inputs' and owner_id=auth.uid()::text and split_part(name,'/',1)=auth.uid()::text);
create policy "Studio source isolation" on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'studio-video-inputs' or (owner_id=auth.uid()::text and split_part(name,'/',1)=auth.uid()::text))
with check(bucket_id<>'studio-video-inputs' or (owner_id=auth.uid()::text and split_part(name,'/',1)=auth.uid()::text));
create function media_security.guard_studio_source()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id<>'studio-video-inputs' then return new; end if;
 if auth.uid() is null or new.owner_id is distinct from auth.uid()::text or new.name !~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}/input$')
 or not exists(select 1 from public.provider_profiles p join public.profiles a on a.id=p.profile_id where p.profile_id=auth.uid() and not a.is_suspended and a.account_status='active') then
 raise exception 'Active professional account required' using errcode='42501'; end if;
 if not public.consume_financial_rate_limit('studio_source_upload',md5(auth.uid()::text),10,3600) then
 raise exception 'Studio upload limit reached' using errcode='42501'; end if;
 return new;
end; $$;
create trigger studio_private_source_guard before insert on storage.objects for each row execute function media_security.guard_studio_source();
revoke all on function media_security.guard_studio_source() from public,anon,authenticated;
create function public.get_studio_source_snapshot(target_owner uuid,target_path text)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'updated_at',o.updated_at,'size',o.metadata->>'size')
 from storage.objects o where o.bucket_id='studio-video-inputs' and o.name=target_path and o.owner_id=target_owner::text
 and split_part(o.name,'/',1)=target_owner::text;
$$;
revoke all on function public.get_studio_source_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function public.get_studio_source_snapshot(uuid,text) to service_role;
commit;
