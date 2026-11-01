begin;

-- Explicit, atomic administrative publication. Does not grant roles or bypass MFA.
create or replace function public.admin_approve_business(
  target_business_id uuid, expected_status text, reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare selected public.businesses%rowtype;
begin
  if auth.uid() is null or not public.has_admin_permission('providers.verify')
    or not public.has_admin_permission('documents.review')
    or not exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.account_status='active' and not p.is_suspended) then
    raise exception 'Vérification administrative et MFA requis' using errcode='42501';
  end if;
  if char_length(trim(coalesce(reason,''))) not between 2 and 2000 then
    raise exception 'Motif de 2 à 2000 caractères requis';
  end if;
  select * into selected from public.businesses where id=target_business_id for update;
  if not found or selected.archived_at is not null or not selected.is_active then
    raise exception 'Salon indisponible';
  end if;
  if selected.owner_id=auth.uid() then
    raise exception 'Un autre administrateur doit examiner votre salon' using errcode='42501';
  end if;
  if expected_status is null or selected.status is distinct from expected_status
    or selected.status not in ('draft','pending_review') then
    raise exception 'Le statut a changé ou ce salon est déjà traité. Actualisez le registre.';
  end if;
  perform 1 from public.provider_profiles v join public.profiles p on p.id=v.profile_id
    where v.profile_id=selected.owner_id and v.status='approved'
      and p.account_status='active' and not p.is_suspended for share of v,p;
  if not found then raise exception 'Le dossier professionnel du propriétaire doit être approuvé'; end if;
  if nullif(trim(selected.name),'') is null or nullif(trim(selected.address),'') is null
    or nullif(trim(selected.city),'') is null or selected.country_code is null
    or selected.currency is null or selected.timezone is null
    or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=selected.timezone) then
    raise exception 'Identité, adresse, pays, devise et fuseau horaire requis';
  end if;
  update public.businesses set status='approved' where id=selected.id;
  perform public.write_admin_audit('business.approved','businesses',selected.id,
    jsonb_build_object('status',selected.status),jsonb_build_object('status','approved'),trim(reason));
end;
$$;
revoke all on function public.admin_approve_business(uuid,text,text) from public,anon;
grant execute on function public.admin_approve_business(uuid,text,text) to authenticated;

commit;
