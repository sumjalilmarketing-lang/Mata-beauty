CREATE OR REPLACE FUNCTION public.activate_internal_invitation(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare invitation public.internal_invitations; role_id_value uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or target_user_id is null then raise exception 'Authentification requise' using errcode='42501'; end if;
 select * into invitation from public.internal_invitations where user_id=target_user_id for update;
 if invitation.id is null then return false; end if;
 if invitation.status='active' then return true; end if;
 if invitation.status<>'pending' or invitation.expires_at<=now() or not exists(select 1 from auth.users where id=target_user_id and email_confirmed_at is not null and encrypted_password<>'') then raise exception 'Invitation expirée ou compte non activé' using errcode='42501'; end if;
 select id into role_id_value from public.admin_roles where key=invitation.role_key and is_active and key<>'super_admin';
 if role_id_value is null then raise exception 'Rôle indisponible'; end if;
 update public.profiles set role='admin',updated_at=now() where id=target_user_id and not is_suspended;
 if not found then raise exception 'Compte suspendu' using errcode='42501'; end if;
 insert into public.admin_user_roles(user_id,role_id,assigned_by,requires_mfa) values(target_user_id,role_id_value,invitation.invited_by,true);
 update public.internal_invitations set status='active',activated_at=now() where id=invitation.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(target_user_id,'team.account_activated','profiles',target_user_id,jsonb_build_object('status','pending'),jsonb_build_object('status','active','role',invitation.role_key));
 insert into public.notifications(profile_id,kind,title,body,data) values(invitation.invited_by,'internal_access','Un membre a activé son compte',invitation.first_name||' '||invitation.last_name||' a activé son accès.',jsonb_build_object('href','/admin/administrators'));
 return true;
end; $function$
;
CREATE OR REPLACE FUNCTION public.admin_assign_role(target_user_id uuid, target_role_key text, reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_role_id uuid; previous_roles jsonb;
begin
 perform public.require_team_manager();
 if target_user_id is null or target_user_id=auth.uid() then raise exception 'Modification de son propre accès interdite' using errcode='42501'; end if;
 if length(trim(coalesce(reason,'')))<2 then raise exception 'Justification requise'; end if;
 perform 1 from public.profiles where id=target_user_id for update;
 if not found then raise exception 'Compte introuvable'; end if;
 select id into target_role_id from public.admin_roles where key=target_role_key and is_active;
 if target_role_id is null then raise exception 'Rôle invalide'; end if;
 perform pg_advisory_xact_lock(72819001);
 if target_role_key<>'super_admin' and exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id where m.user_id=target_user_id and m.is_active and r.key='super_admin')
 and not exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id where m.user_id<>target_user_id and m.is_active and m.revoked_at is null and r.key='super_admin' and not p.is_suspended) then raise exception 'Dernier Super Admin protégé'; end if;
 select coalesce(jsonb_agg(r.key),'[]'::jsonb) into previous_roles from public.admin_user_roles m
 join public.admin_roles r on r.id=m.role_id where m.user_id=target_user_id and m.is_active and m.revoked_at is null;
 update public.admin_user_roles set is_active=false,revoked_at=now() where user_id=target_user_id and is_active;
 update public.profiles set role='admin',updated_at=now() where id=target_user_id;
 insert into public.admin_user_roles(user_id,role_id,assigned_by,requires_mfa,is_active,revoked_at)
 values(target_user_id,target_role_id,auth.uid(),true,true,null)
 on conflict(user_id,role_id) do update set assigned_by=auth.uid(),requires_mfa=true,is_active=true,revoked_at=null,assigned_at=now();
 update public.internal_invitations set role_key=target_role_key where user_id=target_user_id;
 perform public.write_admin_audit('admin.role_assigned','profiles',target_user_id,jsonb_build_object('roles',previous_roles),jsonb_build_object('role',target_role_key),reason);
 insert into public.notifications(profile_id,kind,title,body,data) values(target_user_id,'internal_access','Votre rôle a été modifié','Votre accès est soumis aux permissions de votre nouveau rôle.',jsonb_build_object('href','/admin'));
 return true;
end; $function$
;
CREATE OR REPLACE FUNCTION public.professional_application_detail(target_provider_id uuid)
 RETURNS TABLE(business_name text, bio text, city text, base_address text, years_experience integer, languages text[], cancellation_policy text, first_name text, last_name text, display_name text, email text, phone text, avatar_url text, status text, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.has_admin_permission('providers.read') or not public.has_admin_permission('documents.review') then raise exception 'Accès au dossier refusé'; end if;
  return query select p.business_name,p.bio,p.city,p.base_address,p.years_experience,p.languages,p.cancellation_policy,
    u.first_name,u.last_name,u.display_name,a.email::text,u.phone,u.avatar_url,coalesce(o.status,p.status::text),o.submitted_at
  from public.provider_profiles p join public.profiles u on u.id=p.profile_id join auth.users a on a.id=u.id
  left join public.professional_onboarding o on o.provider_id=p.profile_id where p.profile_id=target_provider_id;
end; $function$
;
CREATE OR REPLACE FUNCTION public.professional_application_history(target_provider_id uuid)
 RETURNS TABLE(happened_at timestamp with time zone, label text, actor text, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.has_admin_permission('providers.read') or not public.has_admin_permission('documents.review') then raise exception 'Accès au dossier refusé'; end if;
  return query
  select events.at,events.label,events.actor,events.detail from (
    select o.submitted_at as at,'Dossier envoyé'::text as label,'Candidat'::text as actor,null::text as detail
    from public.professional_onboarding o where o.provider_id=target_provider_id and o.submitted_at is not null
      and not exists(select 1 from public.audit_logs a where a.entity_id=target_provider_id and a.action='professional.application_submitted')
    union all
    select d.created_at,'Document reçu','Candidat',case d.kind when 'identity' then 'Pièce d’identité' when 'business_registration' then 'Immatriculation' when 'qualification' then 'Qualification' when 'address_proof' then 'Justificatif d’adresse' else 'Document professionnel' end
    from public.provider_documents d where d.provider_id=target_provider_id
    union all
    select a.created_at,case a.after_data->>'status' when 'submitted' then case when a.before_data->>'status'='additional_information_required' then 'Complément reçu' else 'Dossier envoyé' end when 'approved' then case when a.before_data->>'status'='suspended' then 'Réactivé' else 'Approuvé' end when 'rejected' then 'Refusé' when 'suspended' then 'Suspendu' when 'under_review' then 'Examen commencé' when 'additional_information_required' then 'Complément demandé' else 'Décision enregistrée' end,
      coalesce(p.display_name,'Agent autorisé'),a.after_data->>'justification'
    from public.audit_logs a left join public.profiles p on p.id=a.actor_id
    where a.entity_id=target_provider_id and a.entity_type='provider_profiles' and a.action in ('professional.application_reviewed','provider.status_changed','professional.application_submitted')
  ) events order by events.at desc;
end; $function$
;
CREATE OR REPLACE FUNCTION public.professional_application_readiness(target_provider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.request_professional_document_update(target_document_id uuid, public_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare document public.provider_documents;
begin
  if auth.uid() is null or not public.has_admin_permission('documents.review') or not public.has_admin_permission('providers.verify') then raise exception 'Autorisation de vérification requise'; end if;
  select * into document from public.provider_documents where id=target_document_id;
  if not found then raise exception 'Document introuvable'; end if;
  perform public.review_professional_application(document.provider_id,'additional_information_required',public_message);
  update public.provider_documents set status='rejected',rejection_reason=trim(public_message),reviewed_by=auth.uid(),reviewed_at=now() where id=target_document_id;
  insert into public.document_reviews(document_id,reviewer_id,decision,reason) values(target_document_id,auth.uid(),'more_information',trim(public_message));
end; $function$
;
CREATE OR REPLACE FUNCTION public.require_team_manager()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2'
 or not public.is_super_admin() or not public.has_admin_permission('roles.manage') then
 raise exception 'Super Admin avec MFA requis' using errcode='42501'; end if;
end; $function$
;
CREATE OR REPLACE FUNCTION public.review_professional_application(target_provider_id uuid, decision text, public_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.write_admin_audit(audit_action text, resource_type text, resource_id uuid, previous_value jsonb, next_value jsonb, justification text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare audit_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Accès administrateur requis'; end if;
  if char_length(trim(coalesce(justification, ''))) < 2 then raise exception 'Une justification est requise'; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    auth.uid(), audit_action, resource_type, resource_id,
    coalesce(previous_value, '{}'::jsonb),
    coalesce(next_value, '{}'::jsonb) || jsonb_build_object('justification', justification)
  )
  returning id into audit_id;
  return audit_id;
end;
$function$
;
