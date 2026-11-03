begin;

-- Refuse an unexpected pre-existing custom role instead of expanding it.
do $$ begin
  if exists(select 1 from public.admin_roles r join public.admin_role_permissions p on p.role_id=r.id
    where r.key='commercial' and p.permission_key not in ('providers.read','providers.verify','documents.review')) then
    raise exception 'Le rôle commercial existant exige une revue manuelle';
  end if;
end $$;
-- New department role only: never assign or promote an existing account.
insert into public.admin_roles(key,name,description,is_system)
values('commercial','Commercial — validation des dossiers','Dossiers professionnels et justificatifs ; sans accès finance, support ou gestion des comptes internes.',true)
on conflict(key) do nothing;
insert into public.admin_role_permissions(role_id,permission_key)
select r.id,p.permission_key from public.admin_roles r
cross join (values('providers.read'),('providers.verify'),('documents.review')) p(permission_key)
where r.key='commercial'
on conflict(role_id,permission_key) do nothing;

-- Finance retains financial audit via payments.read. Global audit is not needed.
delete from public.admin_role_permissions p using public.admin_roles r
where p.role_id=r.id and r.key='finance' and p.permission_key='audit.read';

-- Invoker keeps the caller's existing payment RLS and MFA permission gate.
-- Aggregate all matching records, never just the first page; do not mix currencies
-- or simulations with real records. On-site cash is separate from online funds.
create or replace function public.finance_payment_overview(start_at timestamptz default null,end_at timestamptz default null)
returns table(currency text,test_mode boolean,payment_count bigint,online_collected bigint,on_site_collected bigint,refunds_recorded bigint,commissions_recorded bigint,professional_net_recorded bigint,pending_amount bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not public.has_admin_permission('payments.read') then
    raise exception 'Accès financier requis' using errcode='42501';
  end if;
  if start_at is not null and end_at is not null and end_at<=start_at then
    raise exception 'Période invalide' using errcode='22023';
  end if;
  return query
  with scoped as (
    select p.*,
      (p.is_test or p.provider='mock' or p.payment_status='simulated_paid') as simulation,
      (p.payment_status in ('simulated_paid','paid','held','available','payout_pending','paid_out','partially_refunded','refunded')
        or (p.payment_status='disputed' and (p.paid_at is not null or p.confirmed_at is not null))) as collected
    from public.payments p
    where (start_at is null or p.created_at>=start_at) and (end_at is null or p.created_at<end_at)
  )
  select trim(p.currency)::text,p.simulation,count(*),
    coalesce(sum(coalesce(p.gross_amount,p.amount)) filter(where p.collected),0)::bigint,
    coalesce(sum(coalesce(p.gross_amount,p.amount)) filter(where p.payment_status='paid_on_site'),0)::bigint,
    coalesce(sum(p.refunded_amount),0)::bigint,
    coalesce(sum(p.platform_fee) filter(where p.collected or p.payment_status='paid_on_site'),0)::bigint,
    coalesce(sum(p.professional_net_amount) filter(where p.collected or p.payment_status='paid_on_site'),0)::bigint,
    coalesce(sum(coalesce(p.gross_amount,p.amount)) filter(where p.payment_status in ('pending','authorized')),0)::bigint
  from scoped p group by trim(p.currency),p.simulation order by trim(p.currency),p.simulation;
end; $$;
revoke all on function public.finance_payment_overview(timestamptz,timestamptz) from public,anon;
grant execute on function public.finance_payment_overview(timestamptz,timestamptz) to authenticated;
-- Keep the existing dossier-notification workflow, now including Commercial.
create or replace function public.notify_application_submitted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='submitted' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(profile_id,kind,title,body,data)
    values(new.provider_id,'professional_application','Votre dossier professionnel a été reçu','L’équipe va examiner vos informations et vos quatre documents.',jsonb_build_object('status','submitted','href','/app/application'));
    insert into public.notifications(profile_id,kind,title,body,data)
    select m.user_id,'application_to_review',
      case when tg_op='UPDATE' and old.status='additional_information_required' then 'Complément reçu : dossier à vérifier' else 'Nouveau dossier professionnel' end,
      'Un dossier complet attend votre examen.',
      jsonb_build_object('provider_id',new.provider_id,'href',
        (case when bool_or(r.key='commercial') then '/commercial' else '/onboarding' end)||'?dossier='||new.provider_id::text)
    from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id
    where r.key in ('commercial','verification_agent') and r.is_active and m.is_active
      and m.revoked_at is null and not p.is_suspended and p.account_status='active' and m.user_id<>new.provider_id
    group by m.user_id;
  end if;
  return new;
end; $$;
revoke all on function public.notify_application_submitted() from public,anon,authenticated;
commit;
