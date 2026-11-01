-- Account lifecycle is separate from user-editable profile data.
create table public.admin_account_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  archived_at timestamptz,
  deletion_pending boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.admin_account_operations (
  id uuid primary key,
  target_user_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('suspend','archive','reactivate','delete')),
  status text not null check (status in ('pending','completed','failed')),
  reason text not null,
  retained_consent jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.admin_account_state enable row level security;
alter table public.admin_account_operations enable row level security;
revoke all on public.admin_account_state, public.admin_account_operations from anon, authenticated;
grant select on public.admin_account_state, public.admin_account_operations to authenticated;
grant all on public.admin_account_state, public.admin_account_operations to service_role;
create policy "Super Admin lifecycle read" on public.admin_account_state for select to authenticated
using (public.is_super_admin() and public.has_admin_permission('users.read'));
create policy "Super Admin lifecycle history read" on public.admin_account_operations for select to authenticated
using (public.is_super_admin() and public.has_admin_permission('users.read'));

-- Fail closed for every unknown public dependency. Only preferences and purely
-- personal convenience data can cascade; business records and evidence cannot.
create function public.account_retained_dependencies(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare dependency record; total bigint; result jsonb := '[]';
begin
  for dependency in
    select distinct n.nspname, t.relname, a.attname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.contype='f' and n.nspname='public'
      and c.confrelid in ('public.profiles'::regclass,'public.client_profiles'::regclass,'auth.users'::regclass)
      and t.relname not in ('profiles','client_profiles','account_roles','profile_preferences','profile_privacy_settings',
        'notification_preferences','notifications','welcome_email_deliveries','post_likes','post_saves','follows',
        'admin_account_state')
  loop
    execute format('select count(*) from %I.%I where %I=$1',dependency.nspname,dependency.relname,dependency.attname)
      into total using target_user_id;
    if total>0 then result:=result||jsonb_build_array(jsonb_build_object('table',dependency.relname,'column',dependency.attname,'count',total)); end if;
  end loop;
  select count(*) into total from storage.objects where owner_id=target_user_id::text
    or split_part(name,'/',1)=target_user_id::text;
  if total>0 then result:=result||jsonb_build_array(jsonb_build_object('table','documents_et_fichiers','count',total)); end if;
  return result;
end; $$;
revoke all on function public.account_retained_dependencies(uuid) from public,anon,authenticated;

create function public.admin_account_preview(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare person public.profiles; address text; dependencies jsonb; protected boolean;
begin
  perform public.require_team_manager();
  if not public.has_admin_permission('users.read') then raise exception 'Accès refusé' using errcode='42501'; end if;
  select * into person from public.profiles where id=target_user_id;
  if not found then raise exception 'Compte introuvable'; end if;
  select email into address from auth.users where id=target_user_id;
  protected:=target_user_id=auth.uid() or person.role::text='admin'
    or exists(select 1 from public.admin_user_roles where user_id=target_user_id);
  dependencies:=public.account_retained_dependencies(target_user_id);
  return jsonb_build_object('userId',person.id,'name',person.display_name,'email',address,
    'protected',protected,'dependencies',dependencies,'canDelete',not protected and jsonb_array_length(dependencies)=0,
    'removedData',jsonb_build_array('Identité et accès Auth','Profil Client','Préférences, favoris et notifications personnelles'),
    'retainedData',jsonb_build_array('Journal de l’opération','Dates des consentements légaux'),
    'archived',exists(select 1 from public.admin_account_state where user_id=target_user_id and archived_at is not null));
end; $$;
revoke all on function public.admin_account_preview(uuid) from public,anon;
grant execute on function public.admin_account_preview(uuid) to authenticated;

create function public.admin_manage_account(target_user_id uuid, target_action text, target_reason text, operation_id uuid, confirmation text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare person public.profiles; previous public.admin_account_operations; dependencies jsonb; consent jsonb;
begin
  perform public.require_team_manager();
  if not public.has_admin_permission('users.suspend') or not public.has_admin_permission('users.delete') then raise exception 'Permissions de gestion requises' using errcode='42501'; end if;
  if target_action is null or target_action not in ('suspend','archive','reactivate','delete') or operation_id is null
    or length(trim(coalesce(target_reason,''))) not between 5 and 1000 then raise exception 'Action ou justification invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
  select * into previous from public.admin_account_operations where id=operation_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.target_user_id<>target_user_id or previous.action<>target_action then raise exception 'Identifiant d’opération invalide'; end if;
    return jsonb_build_object('operationId',previous.id,'status',previous.status,'action',previous.action);
  end if;
  select * into person from public.profiles where id=target_user_id for update;
  if not found then raise exception 'Compte introuvable'; end if;
  if target_user_id=auth.uid() or person.role::text='admin' or exists(select 1 from public.admin_user_roles where user_id=target_user_id) then
    raise exception 'Compte interne ou votre propre compte protégé. Utilisez Équipe et accès pour les accès internes.';
  end if;
  if exists(select 1 from public.admin_account_state where user_id=target_user_id and deletion_pending) then raise exception 'Suppression en cours : actualisez son résultat avant toute autre action'; end if;
  if target_action='delete' then
    if confirmation is distinct from 'SUPPRIMER' then raise exception 'Confirmation renforcée requise'; end if;
    dependencies:=public.account_retained_dependencies(target_user_id);
    if jsonb_array_length(dependencies)>0 then raise exception 'Suppression interdite : des données doivent être conservées. Archivez le compte.'; end if;
  end if;
  consent:=jsonb_build_object('termsAcceptedAt',person.terms_accepted_at,'privacyAcceptedAt',person.privacy_accepted_at);
  insert into public.admin_account_operations(id,target_user_id,actor_id,action,status,reason,retained_consent)
  values(operation_id,target_user_id,auth.uid(),target_action,case when target_action='delete' then 'pending' else 'completed' end,trim(target_reason),consent);
  insert into public.admin_account_state(user_id,archived_at,deletion_pending)
  values(target_user_id,case when target_action='archive' then now() else null end,target_action='delete')
  on conflict(user_id) do update set archived_at=case when target_action='archive' then now() when target_action='reactivate' then null else admin_account_state.archived_at end,
    deletion_pending=target_action='delete',updated_at=now();
  update public.profiles set is_suspended=(target_action<>'reactivate'),updated_at=now() where id=target_user_id;
  update auth.users set banned_until=case when target_action='reactivate' then null else now()+interval '100 years' end where id=target_user_id;
  if target_action<>'reactivate' then delete from auth.sessions where user_id=target_user_id; end if;
  perform public.write_admin_audit('account.'||target_action||case when target_action='delete' then '_started' else '' end,'profiles',target_user_id,
    jsonb_build_object('is_suspended',person.is_suspended),jsonb_build_object('operation_id',operation_id,'action',target_action),trim(target_reason));
  return jsonb_build_object('operationId',operation_id,'action',target_action,'status',case when target_action='delete' then 'pending' else 'completed' end);
end; $$;
revoke all on function public.admin_manage_account(uuid,text,text,uuid,text) from public,anon;
grant execute on function public.admin_manage_account(uuid,text,text,uuid,text) to authenticated;

-- The provider Auth API performs the actual deletion. Recheck dependencies at
-- the database boundary as well, so a concurrent new reference cannot cascade.
create function public.guard_managed_account_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.admin_account_state where user_id=old.id and deletion_pending)
    and jsonb_array_length(public.account_retained_dependencies(old.id))>0 then
    raise exception 'Nouvelles dépendances : suppression refusée';
  end if;
  return old;
end; $$;
revoke all on function public.guard_managed_account_deletion() from public,anon,authenticated;
create trigger guard_managed_account_deletion before delete on public.profiles for each row execute function public.guard_managed_account_deletion();

create function public.finish_admin_account_deletion(operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare operation public.admin_account_operations; gone boolean;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service serveur requis' using errcode='42501'; end if;
  select * into operation from public.admin_account_operations where id=operation_id for update;
  if not found or operation.action<>'delete' then raise exception 'Opération introuvable'; end if;
  gone:=not exists(select 1 from auth.users where id=operation.target_user_id)
    and not exists(select 1 from public.profiles where id=operation.target_user_id);
  update public.admin_account_operations set status=case when gone then 'completed' else 'failed' end,completed_at=now() where id=operation_id;
  if not gone then update public.admin_account_state set deletion_pending=false where user_id=operation.target_user_id; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(operation.actor_id,case when gone then 'account.deleted' else 'account.deletion_failed' end,'profiles',operation.target_user_id,
    '{}',jsonb_build_object('operation_id',operation_id,'auth_and_profile_removed',gone,'reason',operation.reason));
  return jsonb_build_object('operationId',operation_id,'status',case when gone then 'completed' else 'failed' end);
end; $$;
revoke all on function public.finish_admin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.finish_admin_account_deletion(uuid) to service_role;

create function public.guard_archived_account_reactivation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not new.is_suspended and exists(select 1 from public.admin_account_state where user_id=new.id and (archived_at is not null or deletion_pending)) then
    raise exception 'Compte archivé ou en suppression : utilisez la gestion sécurisée des comptes';
  end if;
  return new;
end; $$;
revoke all on function public.guard_archived_account_reactivation() from public,anon,authenticated;
create trigger guard_archived_account_reactivation before update of is_suspended on public.profiles for each row execute function public.guard_archived_account_reactivation();

create function public.admin_managed_accounts(search_term text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_team_manager();
  select coalesce(jsonb_agg(to_jsonb(listed)||jsonb_build_object(
    'is_archived',state.archived_at is not null,'deletion_pending',coalesce(state.deletion_pending,false),
    'is_test',coalesce(u.raw_app_meta_data->>'qa_suppress_email','false')='true',
    'is_protected',listed.user_id=auth.uid() or listed.account_role='admin' or exists(select 1 from public.admin_user_roles where user_id=listed.user_id))), '[]')
  into result from public.admin_list_users(search_term) listed
  join auth.users u on u.id=listed.user_id left join public.admin_account_state state on state.user_id=listed.user_id;
  return result;
end; $$;
revoke all on function public.admin_managed_accounts(text) from public,anon;
grant execute on function public.admin_managed_accounts(text) to authenticated;

create function public.professional_application_readiness(target_provider_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate public.provider_profiles; current_status text; missing text[] := '{}'; permitted boolean;
begin
  if auth.uid() is null or not public.has_admin_permission('documents.review') then raise exception 'Accès aux documents refusé' using errcode='42501'; end if;
  select * into candidate from public.provider_profiles where profile_id=target_provider_id;
  if not found then raise exception 'Dossier introuvable'; end if;
  select status into current_status from public.professional_onboarding where provider_id=target_provider_id;
  select coalesce(array_agg(required.label),'{}') into missing from (values
    ('identity','Pièce d’identité'),('business_registration','Immatriculation'),('qualification','Qualification'),('address_proof','Justificatif d’adresse')) required(kind,label)
  where not exists(select 1 from public.provider_documents d where d.provider_id=target_provider_id and d.kind=required.kind
    and d.id=(select latest.id from public.provider_documents latest where latest.provider_id=target_provider_id and latest.kind=required.kind order by latest.created_at desc,latest.id desc limit 1)
    and d.status in ('pending','approved') and exists(select 1 from storage.objects o where o.bucket_id='provider-documents' and o.name=d.storage_path and split_part(o.name,'/',1)=target_provider_id::text));
  if candidate.onboarding_progress is distinct from 100 then missing:=array_append(missing,'Informations professionnelles incomplètes'); end if;
  permitted:=target_provider_id<>auth.uid() and public.has_admin_permission('providers.verify') and current_status in ('submitted','under_review','additional_information_required');
  return jsonb_build_object('allowed',coalesce(permitted,false),'complete',cardinality(missing)=0,'missing',missing,'status',current_status,
    'reason',case when target_provider_id=auth.uid() then 'Vous ne pouvez pas approuver votre propre candidature.'
      when not public.has_admin_permission('providers.verify') then 'Votre rôle ne permet pas de décider sur ce dossier.'
      when current_status not in ('submitted','under_review','additional_information_required') or current_status is null then 'Dossier non soumis ou déjà traité.'
      when cardinality(missing)>0 then 'Approbation impossible : le dossier est incomplet.'
      else 'Les quatre pièces sont reçues. Vérifiez leur contenu et l’identité avant de confirmer.' end);
end; $$;
revoke all on function public.professional_application_readiness(uuid) from public,anon;
grant execute on function public.professional_application_readiness(uuid) to authenticated;

-- Preserve the reviewed workflow, adding an explicit self-decision guard.
create or replace function public.review_professional_application(target_provider_id uuid, decision text, public_message text)
returns void language plpgsql security definer set search_path='' as $$
declare candidate public.provider_profiles; previous_status text; missing text[];
begin
  if auth.uid() is null or not public.has_admin_permission('providers.verify') or not public.has_admin_permission('documents.review') then raise exception 'Autorisation de vérification requise'; end if;
  if target_provider_id=auth.uid() then raise exception 'Auto-approbation interdite' using errcode='42501'; end if;
  if decision is null or decision not in ('approved','rejected','additional_information_required','under_review') then raise exception 'Décision invalide'; end if;
  if length(trim(coalesce(public_message,''))) not between 3 and 1000 then raise exception 'Une explication destinée au candidat est requise'; end if;
  select * into candidate from public.provider_profiles where profile_id=target_provider_id for update;
  if not found then raise exception 'Dossier introuvable'; end if;
  select status into previous_status from public.professional_onboarding where provider_id=target_provider_id for update;
  if previous_status is null or (previous_status not in ('submitted','under_review','additional_information_required') and not (previous_status='suspended' and decision='approved' and public.has_admin_permission('providers.suspend'))) then raise exception 'Dossier non soumis ou déjà traité'; end if;
  if decision='approved' then
    select array_agg(required.kind) into missing from unnest(array['identity','business_registration','qualification','address_proof']) required(kind)
    where not exists(select 1 from public.provider_documents d where d.provider_id=target_provider_id and d.kind=required.kind
      and d.id=(select latest.id from public.provider_documents latest where latest.provider_id=target_provider_id and latest.kind=required.kind order by latest.created_at desc,latest.id desc limit 1)
      and d.status in ('pending','approved') and exists(select 1 from storage.objects o where o.bucket_id='provider-documents' and o.name=d.storage_path and split_part(o.name,'/',1)=target_provider_id::text));
    if cardinality(missing)>0 or candidate.onboarding_progress<>100 then raise exception 'Dossier incomplet : approbation impossible'; end if;
    update public.provider_profiles set status='approved',verified_at=now() where profile_id=target_provider_id;
    insert into public.account_roles(profile_id,role) values(target_provider_id,'professional') on conflict do nothing;
  elsif decision='rejected' then
    update public.provider_profiles set status='rejected' where profile_id=target_provider_id;
  end if;
  update public.professional_onboarding set status=case when decision='approved' then 'verified' else decision end,
    rejection_reason=trim(public_message),assigned_agent=auth.uid(),updated_at=now() where provider_id=target_provider_id;
  insert into public.notifications(profile_id,kind,title,body,data) values(target_provider_id,'professional_application',
    case decision when 'approved' then 'Votre compte professionnel est approuvé' when 'rejected' then 'Décision sur votre candidature' when 'additional_information_required' then 'Un complément est demandé' else 'Votre dossier est en cours d’examen' end,
    trim(public_message),jsonb_build_object('status',decision));
  perform public.write_admin_audit('professional.application_reviewed','provider_profiles',target_provider_id,jsonb_build_object('status',previous_status),jsonb_build_object('status',decision),trim(public_message));
end; $$;

