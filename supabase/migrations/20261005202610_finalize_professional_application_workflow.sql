begin;
-- Google OAuth identity: idempotent customer profiles and professional upgrade without a second Auth user.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
  accepted_at timestamptz;
  avatar_candidate text;
  professional_intent boolean;
begin
  requested_name := left(coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    new.phone,
    'Mata'
  ), 80);
  accepted_at := case when new.raw_user_meta_data->>'legal_accepted' = 'true' then now() else null end;
  avatar_candidate := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
  if avatar_candidate !~ '^https://' or char_length(avatar_candidate) > 2000 then avatar_candidate := null; end if;
  professional_intent := new.raw_user_meta_data->>'professional_intent' = 'true';

  insert into public.profiles(id, role, display_name, avatar_url, account_status, terms_accepted_at, privacy_accepted_at)
  values(
    new.id,
    'client',
    requested_name,
    avatar_candidate,
    case
      when new.email is not null and new.email_confirmed_at is null then 'email_unverified'
      when new.phone is not null and new.phone_confirmed_at is null then 'phone_unverified'
      else 'active'
    end,
    accepted_at,
    accepted_at
  );
  insert into public.client_profiles(profile_id) values(new.id);
  insert into public.account_roles(profile_id, role) values(new.id, 'customer');

  if professional_intent then
    insert into public.provider_profiles(profile_id, business_name, slug)
    values(new.id, requested_name, 'provider-' || replace(left(new.id::text, 18), '-', ''));

    insert into public.professional_onboarding(provider_id) values(new.id);
  end if;
  return new;
end;
$$;

-- An application is not professional authorisation. Existing approved accounts keep access.
create or replace function public.request_provider_onboarding(target_business_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and not is_suspended and account_status='active') then raise exception 'Compte actif requis'; end if;
  if length(trim(coalesce(target_business_name,''))) not between 2 and 120 then raise exception 'Nom professionnel requis'; end if;
  insert into public.provider_profiles(profile_id,business_name,slug)
  values(auth.uid(),trim(target_business_name),'provider-'||replace(auth.uid()::text,'-','')) on conflict(profile_id) do nothing;
  insert into public.professional_onboarding(provider_id) values(auth.uid()) on conflict(provider_id) do nothing;
end; $$;

create or replace function public.request_professional_profile()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.provider_profiles;
begin
  perform public.request_provider_onboarding(coalesce((select nullif(display_name,'') from public.profiles where id=auth.uid()),'Mon activité'));
  select * into result from public.provider_profiles where profile_id=auth.uid();
  return jsonb_build_object('provider_id',result.profile_id,'status',result.status,'onboarding_progress',result.onboarding_progress);
end; $$;

create or replace function public.protect_provider_review_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','')='service_role'
    or coalesce(current_setting('request.jwt.claim.role',true),'')='service_role'
    or coalesce(current_setting('mata.rating_refresh',true),'')='trusted'
    or public.has_admin_permission('providers.verify') or public.has_admin_permission('providers.suspend') then return new; end if;
  if tg_op='INSERT' then
    if new.status<>'draft' or new.verified_at is not null then raise exception 'Un nouveau profil doit être un brouillon'; end if;
  elsif new.status is distinct from old.status or new.verified_at is distinct from old.verified_at or new.average_rating is distinct from old.average_rating or new.review_count is distinct from old.review_count then
    if current_user='postgres' and current_setting('mata.application_submit',true)=new.profile_id::text
      and auth.uid()=new.profile_id and new.status='pending_review' and old.status in ('draft','rejected')
      and new.verified_at is not distinct from old.verified_at and new.average_rating is not distinct from old.average_rating and new.review_count is not distinct from old.review_count then return new; end if;
    raise exception 'La validation professionnelle est réservée au serveur';
  end if;
  return new;
end; $$;

create or replace function public.submit_provider_for_review()
returns public.provider_status language plpgsql security definer set search_path='' as $$
declare candidate public.provider_profiles; missing text[];
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into candidate from public.provider_profiles where profile_id=auth.uid() for update;
  if candidate.profile_id is null or candidate.status not in ('draft','rejected','pending_review') then raise exception 'Dossier non modifiable'; end if;
  if candidate.onboarding_progress<>100 or length(trim(candidate.business_name))<2 or length(trim(coalesce(candidate.bio,'')))<40 or length(trim(candidate.city))<2 or length(trim(coalesce(candidate.base_address,'')))<4 then raise exception 'Complétez les informations professionnelles'; end if;
  select array_agg(required.kind) into missing from unnest(array['identity','business_registration','qualification','address_proof']) required(kind)
  where not exists (select 1 from public.provider_documents d where d.provider_id=auth.uid() and d.kind=required.kind
    and d.id=(select latest.id from public.provider_documents latest where latest.provider_id=auth.uid() and latest.kind=required.kind order by latest.created_at desc,latest.id desc limit 1)
    and d.status in ('pending','approved') and exists(select 1 from storage.objects o where o.bucket_id='provider-documents' and o.name=d.storage_path and split_part(o.name,'/',1)=auth.uid()::text));
  if cardinality(missing)>0 then raise exception 'Les quatre documents sont obligatoires : %',array_to_string(missing,', '); end if;
  if candidate.status='pending_review' and exists(select 1 from public.professional_onboarding where provider_id=auth.uid() and status in ('submitted','under_review')) then return candidate.status; end if;
  perform set_config('mata.application_submit',auth.uid()::text,true);
  update public.provider_profiles set status='pending_review' where profile_id=auth.uid();
  perform set_config('mata.application_submit','',true);
  update public.professional_onboarding set status='submitted',current_step='review',missing_fields='{}',rejection_reason=null,submitted_at=now(),updated_at=now() where provider_id=auth.uid();
  return 'pending_review';
end; $$;

create or replace function public.review_professional_application(target_provider_id uuid, decision text, public_message text)
returns void language plpgsql security definer set search_path='' as $$
declare candidate public.provider_profiles; previous_status text; missing text[];
begin
  if auth.uid() is null or not public.has_admin_permission('providers.verify') or not public.has_admin_permission('documents.review') then raise exception 'Autorisation de vérification requise'; end if;
  if decision not in ('approved','rejected','additional_information_required','under_review') then raise exception 'Décision invalide'; end if;
  if length(trim(coalesce(public_message,''))) not between 3 and 1000 then raise exception 'Une explication destinée au candidat est requise'; end if;
  select * into candidate from public.provider_profiles where profile_id=target_provider_id for update;
  if not found then raise exception 'Dossier introuvable'; end if;
  select status into previous_status from public.professional_onboarding where provider_id=target_provider_id for update;
  if previous_status is null or previous_status not in ('submitted','under_review','additional_information_required') then raise exception 'Dossier non soumis ou déjà traité'; end if;
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

-- Keep the old admin action compatible, but never bypass application validation.
create or replace function public.admin_set_provider_status(target_provider_id uuid,next_status public.provider_status,reason text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if next_status in ('approved','rejected') then
    perform public.review_professional_application(target_provider_id,next_status::text,reason);
  elsif next_status='suspended' then
    if auth.uid() is null or not public.has_admin_permission('providers.suspend') then raise exception 'Permission providers.suspend requise'; end if;
    if length(trim(coalesce(reason,'')))<3 then raise exception 'Motif requis'; end if;
    update public.provider_profiles set status='suspended' where profile_id=target_provider_id;
    update public.professional_onboarding set status='suspended',updated_at=now() where provider_id=target_provider_id;
    perform public.write_admin_audit('provider.status_changed','provider_profiles',target_provider_id,null,jsonb_build_object('status','suspended'),reason);
  else raise exception 'Transition administrative interdite'; end if;
  return true;
end; $$;

revoke all on function public.request_provider_onboarding(text), public.request_professional_profile(), public.submit_provider_for_review(), public.review_professional_application(uuid,text,text), public.admin_set_provider_status(uuid,public.provider_status,text) from public,anon;
grant execute on function public.request_provider_onboarding(text), public.request_professional_profile(), public.submit_provider_for_review(), public.review_professional_application(uuid,text,text), public.admin_set_provider_status(uuid,public.provider_status,text) to authenticated;

create or replace function public.request_professional_document_update(target_document_id uuid, public_message text)
returns void language plpgsql security definer set search_path='' as $$
declare document public.provider_documents;
begin
  if auth.uid() is null or not public.has_admin_permission('documents.review') or not public.has_admin_permission('providers.verify') then raise exception 'Autorisation de vérification requise'; end if;
  select * into document from public.provider_documents where id=target_document_id;
  if not found then raise exception 'Document introuvable'; end if;
  perform public.review_professional_application(document.provider_id,'additional_information_required',public_message);
  update public.provider_documents set status='rejected',rejection_reason=trim(public_message),reviewed_by=auth.uid(),reviewed_at=now() where id=target_document_id;
  insert into public.document_reviews(document_id,reviewer_id,decision,reason) values(target_document_id,auth.uid(),'more_information',trim(public_message));
end; $$;
revoke all on function public.request_professional_document_update(uuid,text) from public,anon;
grant execute on function public.request_professional_document_update(uuid,text) to authenticated;

create or replace function public.protect_document_review_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','')='service_role' or public.has_admin_permission('documents.review') then return new; end if;
  if new.provider_id<>auth.uid() or new.kind not in ('identity','business_registration','qualification','address_proof')
    or split_part(new.storage_path,'/',1)<>auth.uid()::text
    or not exists(select 1 from storage.objects where bucket_id='provider-documents' and name=new.storage_path) then raise exception 'Document privé invalide'; end if;
  if tg_op='INSERT' then
    new.status:='pending'; new.rejection_reason:=null; new.reviewed_by:=null; new.reviewed_at:=null;
  elsif new.status is distinct from old.status or new.rejection_reason is distinct from old.rejection_reason or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
    or new.storage_path is distinct from old.storage_path or new.kind is distinct from old.kind or new.provider_id is distinct from old.provider_id then
    raise exception 'Envoyez un nouveau document pour demander sa vérification';
  end if;
  return new;
end; $$;

create or replace function public.sync_professional_application_authorization()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='approved' then
    insert into public.account_roles(profile_id,role) values(new.profile_id,'professional') on conflict do nothing;
    update public.professional_onboarding set status='verified',updated_at=now() where provider_id=new.profile_id;
  else
    delete from public.account_roles where profile_id=new.profile_id and role='professional';
  end if;
  return new;
end; $$;
revoke all on function public.sync_professional_application_authorization() from public,anon,authenticated;
create trigger providers_sync_application_authorization after update of status on public.provider_profiles
for each row execute function public.sync_professional_application_authorization();

create or replace function public.save_professional_onboarding(
  target_business_name text,target_bio text,target_city text,target_service_mode text,target_activity_type text,
  target_years_experience integer,target_base_address text,target_languages text[],target_cancellation_policy text
) returns smallint language plpgsql security definer set search_path = '' as $$
declare computed_progress smallint := 10;
begin
  if auth.uid() is null or not exists(select 1 from public.provider_profiles where profile_id=auth.uid()) then raise exception 'Profil professionnel requis'; end if;
  if char_length(trim(target_business_name)) < 2 or target_service_mode not in ('salon','mobile','both') then raise exception 'Informations professionnelles invalides'; end if;
  if target_activity_type not in ('independent','salon','barber_shop','makeup_artist','hairdresser','nail_artist','esthetician','care_specialist','other') then raise exception 'Type activité invalide'; end if;
  if target_years_experience not between 0 and 80 then raise exception 'Expérience invalide'; end if;
  computed_progress := 25;
  if char_length(trim(coalesce(target_bio,''))) >= 40 then computed_progress := computed_progress + 25; end if;
  if char_length(trim(coalesce(target_city,''))) >= 2 and char_length(trim(coalesce(target_base_address,''))) >= 4 then computed_progress := computed_progress + 25; end if;
  if cardinality(target_languages) > 0 and char_length(trim(coalesce(target_cancellation_policy,''))) >= 20 then computed_progress := computed_progress + 25; end if;
  update public.provider_profiles set business_name=trim(target_business_name),bio=nullif(trim(target_bio),''),city=trim(target_city),service_mode=target_service_mode,
    activity_type=target_activity_type,years_experience=target_years_experience,base_address=nullif(trim(target_base_address),''),languages=target_languages,
    cancellation_policy=nullif(trim(target_cancellation_policy),''),onboarding_progress=computed_progress where profile_id=auth.uid();
  update public.professional_onboarding set current_step=case when computed_progress=100 then 'documents' else 'professional' end,
    status=case when status in ('submitted','under_review','additional_information_required','verified','suspended','disabled') then status when computed_progress=100 then 'draft' else 'profile_incomplete' end,
    professional_data=jsonb_build_object('activity_type',target_activity_type,'languages',target_languages,'years_experience',target_years_experience),
    location_data=jsonb_build_object('city',target_city,'address',target_base_address,'service_mode',target_service_mode),updated_at=now()
  where provider_id=auth.uid();
  return computed_progress;
end;
$$;
revoke all on function public.save_professional_onboarding(text,text,text,text,text,integer,text,text[],text) from public,anon;
grant execute on function public.save_professional_onboarding(text,text,text,text,text,integer,text,text[],text) to authenticated;
commit;
