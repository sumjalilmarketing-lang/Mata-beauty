-- Guarded audit corrections. No reservation, payment or Storage object DML.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $migration$
declare body text; patched text;
begin
 select replace(prosrc,E'\r\n',E'\n') into body from pg_proc where oid='public.validate_booking_update()'::regprocedure and not prosecdef and prorettype='trigger'::regtype;
 if body is null or md5(body) not in ('c50be37b663dfb758dd6eaa20841abb6','7f4efad6b681220814a29d1b40be73d6') then
  raise exception 'Unexpected validate_booking_update definition; no changes applied';
 end if;
 patched:=replace(body,'  if coalesce(current_setting(''request.jwt.claim.role'',true),'''')=''service_role'' or public.is_admin() then return new; end if;','  if coalesce(auth.jwt()->>''role'','''')=''service_role'' then return new; end if;');
 patched:=replace(patched,'  if auth.uid()=old.provider_id and new.status=old.status and new.collaborator_id is distinct from old.collaborator_id then return new; end if;','  if public.has_admin_permission(''bookings.update'') then return new; end if;'||E'\n'||'  if auth.uid()=old.provider_id and new.status=old.status and new.collaborator_id is distinct from old.collaborator_id then return new; end if;');
 patched:=replace(patched,'  if auth.uid()=old.provider_id and new.status not in','  if auth.uid()=old.provider_id and auth.uid() is distinct from old.client_id and new.status not in');
 if patched=body or position('or public.is_admin() then return new' in patched)>0 then raise exception 'Booking guard patch failed';end if;
 execute format('create or replace function public.validate_booking_update() returns trigger language plpgsql security invoker set search_path = %L as %L','',''||patched);
end;
$migration$;
create policy "Delegated legacy media boundary" on storage.objects as restrictive for select to authenticated using(
 not public.department_is_scoped_actor()
 or bucket_id not in('social-videos','social-thumbnails')
 or owner_id=auth.uid()::text
 or exists(select 1 from public.posts post where public.is_public_social_post(post.id)
  and((objects.bucket_id='social-videos'and split_part(post.video_url,'/social-videos/',2)=objects.name)
   or(objects.bucket_id='social-thumbnails'and split_part(coalesce(post.thumbnail_url,''),'/social-thumbnails/',2)=objects.name)))
);
commit;
