-- A single private inbox. Campaign administration does not grant access to
-- another person's transactional inbox or permission to rewrite its contents.
drop policy if exists "notifications scoped read" on public.notifications;
drop policy if exists "notifications scoped update" on public.notifications;
create policy "notifications recipient read" on public.notifications for select to authenticated using(profile_id=(select auth.uid()));
create policy "notifications recipient update" on public.notifications for update to authenticated using(profile_id=(select auth.uid())) with check(profile_id=(select auth.uid()));
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

-- This RPC deliberately exposes only the identity needed to examine a dossier.
-- auth.users is never exposed as a table or an unrestricted user directory.
create function public.professional_application_detail(target_provider_id uuid)
returns table(business_name text,bio text,city text,base_address text,years_experience integer,languages text[],cancellation_policy text,
 first_name text,last_name text,display_name text,email text,phone text,avatar_url text,status text,submitted_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_admin_permission('providers.read') or not public.has_admin_permission('documents.review') then raise exception 'Accès au dossier refusé'; end if;
  return query select p.business_name,p.bio,p.city,p.base_address,p.years_experience,p.languages,p.cancellation_policy,
    u.first_name,u.last_name,u.display_name,a.email::text,u.phone,u.avatar_url,coalesce(o.status,p.status::text),o.submitted_at
  from public.provider_profiles p join public.profiles u on u.id=p.profile_id join auth.users a on a.id=u.id
  left join public.professional_onboarding o on o.provider_id=p.profile_id where p.profile_id=target_provider_id;
end; $$;

create function public.professional_application_history(target_provider_id uuid)
returns table(happened_at timestamptz,label text,actor text,detail text)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_admin_permission('providers.read') or not public.has_admin_permission('documents.review') then raise exception 'Accès au dossier refusé'; end if;
  return query
  select events.at,events.label,events.actor,events.detail from (
    select o.submitted_at as at,'Dossier envoyé'::text as label,'Candidat'::text as actor,null::text as detail
    from public.professional_onboarding o where o.provider_id=target_provider_id and o.submitted_at is not null
    union all
    select d.created_at,'Document reçu','Candidat',case d.kind when 'identity' then 'Pièce d’identité' when 'business_registration' then 'Immatriculation' when 'qualification' then 'Qualification' when 'address_proof' then 'Justificatif d’adresse' else 'Document professionnel' end
    from public.provider_documents d where d.provider_id=target_provider_id
    union all
    select a.created_at,case a.after_data->>'status' when 'approved' then case when a.before_data->>'status'='suspended' then 'Réactivé' else 'Approuvé' end when 'rejected' then 'Refusé' when 'suspended' then 'Suspendu' when 'under_review' then 'Examen commencé' when 'additional_information_required' then 'Complément demandé' else 'Décision enregistrée' end,
      coalesce(p.display_name,'Agent autorisé'),a.after_data->>'justification'
    from public.audit_logs a left join public.profiles p on p.id=a.actor_id
    where a.entity_id=target_provider_id and a.entity_type='provider_profiles' and a.action in ('professional.application_reviewed','provider.status_changed')
  ) events order by events.at desc;
end; $$;
revoke all on function public.professional_application_detail(uuid),public.professional_application_history(uuid) from public,anon;
grant execute on function public.professional_application_detail(uuid),public.professional_application_history(uuid) to authenticated;

-- Avoid duplicate applicant messages: the review RPC already sends the decision.
-- This legacy trigger now owns only suspension (not approval/rejection/submission).
create or replace function public.notify_provider_status_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.status='suspended' then
    insert into public.notifications(profile_id,kind,title,body,data) values(new.profile_id,'provider_status','Votre activité professionnelle est suspendue','Contactez le support pour connaître la démarche de réactivation.',jsonb_build_object('status','suspended','href','/app/support'));
  end if;
  return new;
end; $$;

create function public.notify_application_submitted() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='submitted' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(profile_id,kind,title,body,data) values(new.provider_id,'professional_application','Votre dossier professionnel a été reçu','L’équipe va examiner vos informations et vos quatre documents.',jsonb_build_object('status','submitted','href','/app/application'));
    -- Target the onboarding team, not every super administrator.
    insert into public.notifications(profile_id,kind,title,body,data)
    select distinct m.user_id,'application_to_review',case when tg_op='UPDATE' and old.status='additional_information_required' then 'Complément reçu : dossier à vérifier' else 'Nouveau dossier professionnel' end,
      'Un dossier complet attend votre examen.',jsonb_build_object('provider_id',new.provider_id,'href','/onboarding?dossier='||new.provider_id::text)
    from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id join public.profiles p on p.id=m.user_id
    where r.key='verification_agent' and r.is_active and m.is_active and not p.is_suspended and m.user_id<>new.provider_id;
  end if;
  return new;
end; $$;
create trigger application_submission_notification after insert or update of status on public.professional_onboarding for each row execute function public.notify_application_submitted();

create or replace function public.notify_booking_status_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare event_title text; event_body text;
begin
  if new.status is not distinct from old.status and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at then return new; end if;
  event_title:=case when new.status='confirmed' and old.status is distinct from new.status then 'Votre rendez-vous est confirmé' when new.status in ('cancelled_by_client','cancelled_by_provider') then 'Rendez-vous annulé' when new.status='completed' then 'Prestation terminée' when new.status='in_progress' then 'Prestation commencée' else 'Rendez-vous modifié' end;
  event_body:=event_title||' : '||to_char(new.starts_at at time zone 'Africa/Dakar','DD/MM/YYYY à HH24:MI')||' (heure de Dakar).';
  insert into public.notifications(profile_id,kind,title,body,data)
  select recipient,'booking_status_changed',event_title,event_body,jsonb_build_object('booking_id',new.id,'status',new.status,'href',prefix||'/bookings#booking-'||new.id::text)
  from (values(new.client_id,'/app'),(new.provider_id,'/pro')) recipients(recipient,prefix);
  return new;
end; $$;
drop trigger if exists bookings_notify_status_changed on public.bookings;
-- Existing trigger name is inspected in QA before applying; avoid duplicate events.
do $$ declare t record; begin
  for t in select tgname from pg_trigger where tgrelid='public.bookings'::regclass and tgfoid='public.notify_booking_status_changed()'::regprocedure and not tgisinternal
  loop execute format('drop trigger %I on public.bookings',t.tgname); end loop;
end; $$;
create trigger bookings_notify_status_changed after update of status,starts_at,ends_at on public.bookings for each row execute function public.notify_booking_status_changed();

-- Attach destination context on the server, including legacy trigger events.
create function public.prepare_notification_destination() returns trigger language plpgsql security definer set search_path='' as $$
declare prefix text; booking uuid;
begin
  if new.data ? 'href' then return new; end if;
  if new.kind in ('professional_application','provider_status') then
    new.data:=new.data||jsonb_build_object('href',case when new.data->>'status'='approved' then '/pro' else '/app/application' end);
  elsif new.data ? 'booking_id' then
    select case when b.provider_id=new.profile_id then '/pro' else '/app' end into prefix from public.bookings b where b.id=(new.data->>'booking_id')::uuid;
    if prefix is not null then new.data:=new.data||jsonb_build_object('href',prefix||'/bookings#booking-'||(new.data->>'booking_id')); end if;
  elsif new.kind='message_created' then
    select c.booking_id,case when b.provider_id=new.profile_id then '/pro' else '/app' end into booking,prefix from public.conversations c join public.bookings b on b.id=c.booking_id where c.id=(new.data->>'conversation_id')::uuid;
    if booking is not null then new.data:=new.data||jsonb_build_object('href',prefix||'/messages?booking='||booking::text); end if;
  end if;
  return new;
end; $$;
create trigger notification_destination before insert on public.notifications for each row execute function public.prepare_notification_destination();

create function public.notify_first_confirmed_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.account_status='active' and (tg_op='INSERT' or old.account_status is distinct from new.account_status) and exists(select 1 from public.welcome_email_deliveries w where w.user_id=new.id) and not exists(select 1 from public.notifications n where n.profile_id=new.id and n.kind='welcome') then
    insert into public.notifications(profile_id,kind,title,body,data) values(new.id,'welcome','Bienvenue sur MATA Beauty','Votre compte est prêt. Complétez votre profil et découvrez les professionnels.',jsonb_build_object('href','/app/profile'));
  end if;
  return new;
end; $$;
create trigger profile_welcome_notification after insert or update of account_status on public.profiles for each row execute function public.notify_first_confirmed_account();
revoke all on function public.notify_application_submitted(),public.prepare_notification_destination(),public.notify_first_confirmed_account() from public,anon,authenticated;

-- Extend the existing delivery ledger instead of adding another notification system.
alter table public.notification_deliveries alter column campaign_id drop not null;
alter table public.notification_deliveries add column notification_id uuid unique references public.notifications(id) on delete cascade;
alter table public.notification_deliveries add constraint delivery_single_source check((campaign_id is not null)::integer+(notification_id is not null)::integer=1);
alter table public.notification_deliveries add column recipient_email text;
alter table public.notification_deliveries add column first_attempt_at timestamptz;
alter table public.notification_deliveries add column last_attempt_at timestamptz;
alter table public.notification_deliveries add column attempts integer not null default 0;
alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check check(status in ('pending','sending','sent','delivered','failed','cancelled','needs_review'));
drop policy if exists "deliveries authorized read" on public.notification_deliveries;
drop policy if exists "deliveries authorized manage" on public.notification_deliveries;
create policy "campaign deliveries authorized read" on public.notification_deliveries for select to authenticated using(campaign_id is not null and (recipient_id=auth.uid() or public.has_admin_permission('notifications.send')));
create policy "campaign deliveries authorized manage" on public.notification_deliveries for all to authenticated using(campaign_id is not null and public.has_admin_permission('notifications.send')) with check(campaign_id is not null and public.has_admin_permission('notifications.send'));
grant all on public.notification_deliveries to service_role;

create function public.queue_transactional_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare preferences public.notification_preferences; enabled boolean := false;
begin
  select * into preferences from public.notification_preferences where profile_id=new.profile_id;
  enabled:=case
    when new.kind in ('booking_created','booking_status_changed') then coalesce(preferences.bookings_email,true)
    when new.kind='appointment_reminder' then coalesce(preferences.reminders_email,true)
    when new.kind='professional_application' and new.data->>'status' in ('submitted','approved','rejected','additional_information_required') then true
    when new.kind='provider_status' and new.data->>'status'='suspended' then true
    else false end;
  if enabled then insert into public.notification_deliveries(notification_id,recipient_id) values(new.id,new.profile_id) on conflict(notification_id) do nothing; end if;
  return new;
end; $$;
create trigger transactional_notification_email after insert on public.notifications for each row execute function public.queue_transactional_notification();

create function public.claim_transactional_emails(batch_size integer default 10)
returns table(delivery_id uuid,recipient text,title text,body text,kind text,data jsonb)
language plpgsql security definer set search_path='' as $$
declare delivery record;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service only'; end if;
  update public.notification_deliveries d set status='needs_review' where d.notification_id is not null and d.status in ('pending','sending','failed') and d.first_attempt_at < now()-interval '23 hours';
  for delivery in
    select d.id,coalesce(d.recipient_email,u.email) address,n.title,n.body,n.kind,n.data
    from public.notification_deliveries d join public.notifications n on n.id=d.notification_id
    join auth.users u on u.id=d.recipient_id join public.profiles p on p.id=u.id
    where d.notification_id is not null and d.status in ('pending','sending','failed')
      and (d.last_attempt_at is null or d.last_attempt_at<now()-interval '2 minutes')
      and u.email_confirmed_at is not null and p.account_status='active' and not p.is_suspended
    order by d.created_at for update of d skip locked limit greatest(1,least(batch_size,20))
  loop
    update public.notification_deliveries set status='sending',recipient_email=delivery.address,first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),attempts=attempts+1 where id=delivery.id;
    delivery_id:=delivery.id;recipient:=delivery.address;title:=delivery.title;body:=delivery.body;kind:=delivery.kind;data:=delivery.data;
    return next;
  end loop;
end; $$;
revoke all on function public.queue_transactional_notification(),public.claim_transactional_emails(integer) from public,anon,authenticated;
grant execute on function public.claim_transactional_emails(integer) to service_role;
