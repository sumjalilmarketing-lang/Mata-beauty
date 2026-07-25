begin;

alter type public.payment_status add value if not exists 'authorized';
alter type public.payment_status add value if not exists 'paid';
alter type public.payment_status add value if not exists 'cancelled';

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role or new.is_suspended is distinct from old.is_suspended then
    raise exception 'La modification du rôle ou de la suspension nécessite un administrateur';
  end if;
  return new;
end;
$$;

create or replace function public.protect_provider_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.verified_at is not null then
      raise exception 'Un nouveau profil prestataire doit être créé en brouillon';
    end if;
  elsif new.status is distinct from old.status
    or new.verified_at is distinct from old.verified_at
    or new.average_rating is distinct from old.average_rating
    or new.review_count is distinct from old.review_count then
    raise exception 'Les champs de validation et de notation sont administrés par le serveur';
  end if;
  return new;
end;
$$;

create or replace function public.protect_document_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.rejection_reason := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  elsif new.status is distinct from old.status
    or new.rejection_reason is distinct from old.rejection_reason
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'La revue des justificatifs nécessite un administrateur';
  end if;
  return new;
end;
$$;

create or replace function public.validate_booking_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  transition_allowed boolean := false;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_admin() then
    return new;
  end if;

  if new.client_id is distinct from old.client_id
    or new.provider_id is distinct from old.provider_id
    or new.provider_service_id is distinct from old.provider_service_id
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.location_mode is distinct from old.location_mode
    or new.appointment_address is distinct from old.appointment_address
    or new.total_amount is distinct from old.total_amount
    or new.currency is distinct from old.currency
    or new.client_note is distinct from old.client_note then
    raise exception 'Les données contractuelles de la réservation sont immuables';
  end if;

  transition_allowed := case old.status
    when 'pending' then new.status in ('confirmed', 'declined', 'cancelled_by_client', 'cancelled_by_provider')
    when 'confirmed' then new.status in ('cancelled_by_client', 'cancelled_by_provider', 'in_progress', 'no_show', 'disputed')
    when 'in_progress' then new.status in ('completed', 'disputed')
    when 'completed' then new.status = 'disputed'
    when 'no_show' then new.status = 'disputed'
    else false
  end;

  if not transition_allowed then
    raise exception 'Transition de réservation interdite : % vers %', old.status, new.status;
  end if;

  if auth.uid() = old.client_id and new.status not in ('cancelled_by_client', 'disputed') then
    raise exception 'Transition non autorisée pour le client';
  end if;
  if auth.uid() = old.provider_id and new.status not in (
    'confirmed', 'declined', 'cancelled_by_provider', 'in_progress', 'completed', 'no_show', 'disputed'
  ) then
    raise exception 'Transition non autorisée pour le prestataire';
  end if;
  if auth.uid() not in (old.client_id, old.provider_id) then
    raise exception 'Modification de réservation interdite';
  end if;
  return new;
end;
$$;

create or replace function public.protect_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_admin() then
    return new;
  end if;
  if auth.uid() = old.client_id then
    if new.booking_id is distinct from old.booking_id
      or new.client_id is distinct from old.client_id
      or new.provider_id is distinct from old.provider_id
      or new.provider_reply is distinct from old.provider_reply
      or new.is_visible is distinct from old.is_visible then
      raise exception 'Modification de l’avis interdite';
    end if;
  elsif auth.uid() = old.provider_id then
    if new.booking_id is distinct from old.booking_id
      or new.client_id is distinct from old.client_id
      or new.provider_id is distinct from old.provider_id
      or new.rating is distinct from old.rating
      or new.comment is distinct from old.comment
      or new.is_visible is distinct from old.is_visible then
      raise exception 'Un prestataire peut uniquement modifier sa réponse';
    end if;
  else
    raise exception 'Modification de l’avis interdite';
  end if;
  return new;
end;
$$;

create or replace function public.refresh_provider_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_provider uuid := coalesce(new.provider_id, old.provider_id);
begin
  update public.provider_profiles
  set
    average_rating = coalesce((
      select round(avg(rating)::numeric, 1)
      from public.reviews
      where provider_id = target_provider and is_visible
    ), 0),
    review_count = (
      select count(*)::integer
      from public.reviews
      where provider_id = target_provider and is_visible
    )
  where profile_id = target_provider;
  return coalesce(new, old);
end;
$$;

create or replace function public.notify_booking_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (profile_id, kind, title, body, data)
  values (
    new.provider_id,
    'booking_created',
    'Nouvelle demande de réservation',
    'Une nouvelle réservation attend votre réponse.',
    jsonb_build_object('booking_id', new.id)
  );
  return new;
end;
$$;

create or replace function public.notify_booking_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (profile_id, kind, title, body, data)
    select recipient, 'booking_status_changed', 'Réservation mise à jour',
      'Le statut de votre réservation est maintenant : ' || new.status::text,
      jsonb_build_object('booking_id', new.id, 'status', new.status)
    from (values (new.client_id), (new.provider_id)) as recipients(recipient)
    where recipient <> auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (profile_id, kind, title, body, data)
  select cm.profile_id, 'message_created', 'Nouveau message',
    'Vous avez reçu un nouveau message.',
    jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.profile_id <> new.sender_id;
  return new;
end;
$$;

create or replace function public.audit_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    case
      when tg_table_name = 'provider_profiles' then new.profile_id
      when tg_table_name = 'profiles' then new.id
      else new.id
    end,
    to_jsonb(old),
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
before update on public.profiles
for each row execute function public.protect_profile_privileges();

drop trigger if exists providers_protect_review_fields on public.provider_profiles;
create trigger providers_protect_review_fields
before insert or update on public.provider_profiles
for each row execute function public.protect_provider_review_fields();

drop trigger if exists documents_protect_review_fields on public.provider_documents;
create trigger documents_protect_review_fields
before insert or update on public.provider_documents
for each row execute function public.protect_document_review_fields();

drop trigger if exists reviews_protect_fields on public.reviews;
create trigger reviews_protect_fields
before update on public.reviews
for each row execute function public.protect_review_fields();

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
after insert or update or delete on public.reviews
for each row execute function public.refresh_provider_rating();

drop trigger if exists bookings_notify_created on public.bookings;
create trigger bookings_notify_created
after insert on public.bookings
for each row execute function public.notify_booking_created();

drop trigger if exists bookings_notify_status on public.bookings;
create trigger bookings_notify_status
after update of status on public.bookings
for each row execute function public.notify_booking_status_changed();

drop trigger if exists messages_notify_created on public.messages;
create trigger messages_notify_created
after insert on public.messages
for each row execute function public.notify_new_message();

drop trigger if exists profiles_audit_sensitive on public.profiles;
create trigger profiles_audit_sensitive
after update of role, is_suspended on public.profiles
for each row execute function public.audit_sensitive_change();

drop trigger if exists providers_audit_sensitive on public.provider_profiles;
create trigger providers_audit_sensitive
after update of status, verified_at on public.provider_profiles
for each row execute function public.audit_sensitive_change();

drop trigger if exists documents_audit_sensitive on public.provider_documents;
create trigger documents_audit_sensitive
after update of status on public.provider_documents
for each row execute function public.audit_sensitive_change();

drop policy if exists "payments client create test" on public.payments;
create policy "payments client create test"
on public.payments for insert
with check (
  is_test
  and payment_status = 'pending'
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.client_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provider-covers',
  'provider-covers',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public provider cover reads" on storage.objects;
create policy "public provider cover reads"
on storage.objects for select
using (bucket_id = 'provider-covers');

drop policy if exists "providers manage own covers" on storage.objects;
create policy "providers manage own covers"
on storage.objects for all
using (
  bucket_id = 'provider-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'provider-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
