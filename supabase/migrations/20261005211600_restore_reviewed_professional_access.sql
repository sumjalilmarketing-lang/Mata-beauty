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

-- Keep the old admin action compatible, but never bypass application validation.
