create extension if not exists pg_net;

-- Cron configuration uses encrypted Vault storage, never a literal token in SQL.
create function public.configure_notification_dispatch(dispatch_secret text)
returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' or length(dispatch_secret)<32 then raise exception 'Configuration serveur requise'; end if;
  select id into secret_id from vault.secrets where name='mata_notification_dispatch';
  if secret_id is null then perform vault.create_secret(dispatch_secret,'mata_notification_dispatch','Authentification du traitement transactionnel MATA');
  else perform vault.update_secret(secret_id,dispatch_secret); end if;
end; $$;
create function public.dispatch_transactional_notifications() returns bigint language plpgsql security definer set search_path='' as $$
declare dispatch_secret text;
begin
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='mata_notification_dispatch';
  if dispatch_secret is null then return null; end if;
  if not exists(select 1 from public.notification_deliveries where notification_id is not null and status in ('pending','sending','failed') and (last_attempt_at is null or last_attempt_at<now()-interval '2 minutes')) then return null; end if;
  return net.http_get(url:='https://mata-beauty.com/api/cron/notifications',headers:=jsonb_build_object('Authorization','Bearer '||dispatch_secret),timeout_milliseconds:=55000);
end; $$;
revoke all on function public.configure_notification_dispatch(text),public.dispatch_transactional_notifications() from public,anon,authenticated;
grant execute on function public.configure_notification_dispatch(text),public.dispatch_transactional_notifications() to service_role;
-- No requests occur until this database is configured explicitly with a secret.
select cron.schedule('mata-transactional-notifications','* * * * *','select public.dispatch_transactional_notifications()');

create function public.notify_publication_completed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status) and not exists(select 1 from public.notifications n where n.profile_id=new.author_id and n.kind='publication_completed' and n.data->>'post_id'=new.id::text) then
    insert into public.notifications(profile_id,kind,title,body,data) values(new.author_id,'publication_completed','Publication réussie','Votre publication est disponible dans votre espace professionnel.',jsonb_build_object('post_id',new.id,'href','/pro/videos'));
  end if;
  return new;
end; $$;
create trigger publication_completed_notification after insert or update of status on public.posts for each row execute function public.notify_publication_completed();
revoke all on function public.notify_publication_completed() from public,anon,authenticated;

-- Persist every submission, including complements, rather than only the latest date.
create function public.audit_application_submission() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='submitted' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'professional.application_submitted','provider_profiles',new.provider_id,
      case when tg_op='UPDATE' then jsonb_build_object('status',old.status) else '{}'::jsonb end,
      jsonb_build_object('status','submitted','justification',case when tg_op='UPDATE' and old.status='additional_information_required' then 'Complément envoyé par le candidat' else 'Dossier envoyé par le candidat' end));
  end if;
  return new;
end; $$;
create trigger application_submission_audit after insert or update of status on public.professional_onboarding for each row execute function public.audit_application_submission();
revoke all on function public.audit_application_submission() from public,anon,authenticated;

create or replace function public.professional_application_history(target_provider_id uuid)
returns table(happened_at timestamptz,label text,actor text,detail text)
language plpgsql security definer set search_path='' as $$
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
end; $$;

-- Test accounts are provisioned by the service with trusted app_metadata. They
-- exercise the delivery ledger but cannot accidentally email fictitious inboxes.
create function public.suppress_fixture_email_delivery() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.notification_id is not null and exists(select 1 from auth.users u where u.id=new.recipient_id and u.raw_app_meta_data->>'qa_suppress_email'='true') then new.status:='cancelled'; end if;
  return new;
end; $$;
create trigger notification_fixture_email before insert on public.notification_deliveries for each row execute function public.suppress_fixture_email_delivery();
revoke all on function public.suppress_fixture_email_delivery() from public,anon,authenticated;
