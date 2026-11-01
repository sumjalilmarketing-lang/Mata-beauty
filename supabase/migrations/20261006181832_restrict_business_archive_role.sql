create or replace function public.archive_owned_business(target_business_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.businesses b where b.id=target_business_id and (b.owner_id=auth.uid() or public.is_super_admin())) then raise exception 'Accès refusé' using errcode='42501'; end if;
 update public.businesses set is_active=false,archived_at=now(),updated_at=now() where id=target_business_id;
 update public.provider_services set is_active=false,archived_at=coalesce(archived_at,now()),updated_at=now() where business_id=target_business_id;
 update public.collaborators set is_active=false,archived_at=coalesce(archived_at,now()),updated_at=now() where business_id=target_business_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'business.archive','business',target_business_id,jsonb_build_object('archived_at',now()));
end; $$;
revoke all on function public.archive_owned_business(uuid) from public,anon;
grant execute on function public.archive_owned_business(uuid) to authenticated;
