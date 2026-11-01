-- Narrow only the administrative branch of legacy policies. Owner/public
-- predicates, media consent and professional approval checks stay unchanged.
do $$
declare item record; gate text; statement text;
begin
 for item in select * from pg_policies where schemaname='public' and tablename in
 ('businesses','business_hours','business_closures','business_media','business_invitations','collaborators','collaborator_services','payment_events','refunds','wallet_ledger','posts','social_post_media','social_profile_visits','promotions')
 and (coalesce(qual,'') like '%is_admin()%' or coalesce(with_check,'') like '%is_admin()%') loop
  gate:=case
   when item.tablename in ('payment_events','refunds','wallet_ledger') then 'public.has_admin_permission(''payments.read'')'
   when item.tablename in ('posts','social_post_media') and item.cmd='SELECT' then '(public.has_admin_permission(''content.manage'') or public.has_admin_permission(''reports.manage''))'
   when item.tablename in ('posts','social_post_media','promotions') then 'public.has_admin_permission(''content.manage'')'
   when item.tablename='social_profile_visits' then 'public.is_super_admin()'
   when item.cmd='SELECT' then 'public.has_admin_permission(''providers.read'')'
   else 'public.is_super_admin()' end;
  statement:=format('alter policy %I on public.%I',item.policyname,item.tablename);
  if item.qual is not null then statement:=statement||' using ('||replace(item.qual,'is_admin()',gate)||')'; end if;
  if item.with_check is not null then statement:=statement||' with check ('||replace(item.with_check,'is_admin()',gate)||')'; end if;
  execute statement;
 end loop;
end; $$;

-- The generic user screen must not bypass the internal-account manager gate.
create or replace function public.admin_set_user_suspension(target_user_id uuid,suspended boolean,reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare previous public.profiles;
begin
 if suspended is null or target_user_id is null then raise exception 'Action invalide'; end if;
 if exists(select 1 from public.admin_user_roles where user_id=target_user_id) then
  return public.admin_change_internal_access(target_user_id,case when suspended then 'suspend' else 'reactivate' end,reason);
 end if;
 if not public.has_admin_permission('users.suspend') then raise exception 'Permission users.suspend requise' using errcode='42501'; end if;
 if target_user_id=auth.uid() then raise exception 'Modification de son propre accès interdite'; end if;
 select * into previous from public.profiles where id=target_user_id for update;
 if previous.id is null then raise exception 'Compte introuvable'; end if;
 update public.profiles set is_suspended=suspended,updated_at=now() where id=target_user_id;
 perform public.write_admin_audit(case when suspended then 'user.suspended' else 'user.reactivated' end,'profiles',target_user_id,jsonb_build_object('is_suspended',previous.is_suspended),jsonb_build_object('is_suspended',suspended),reason);
 return true;
end; $$;
