alter table public.admin_sessions
  add column if not exists auth_session_id uuid;

create unique index if not exists admin_sessions_auth_session_idx
  on public.admin_sessions (user_id, auth_session_id)
  where auth_session_id is not null;

create or replace function public.record_admin_session(client_user_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_identifier uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  session_record_id uuid;
  is_new boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Accès administrateur requis';
  end if;

  select id into session_record_id
  from public.admin_sessions
  where user_id = auth.uid()
    and auth_session_id is not distinct from session_identifier
    and revoked_at is null
  order by signed_in_at desc
  limit 1;

  if session_record_id is null then
    insert into public.admin_sessions (user_id, auth_session_id, user_agent, mfa_verified)
    values (auth.uid(), session_identifier, left(client_user_agent, 500), coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
    returning id into session_record_id;
    is_new := true;
  else
    update public.admin_sessions
    set last_seen_at = now(),
        user_agent = coalesce(left(client_user_agent, 500), user_agent),
        mfa_verified = coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    where id = session_record_id;
  end if;

  if is_new then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    values (
      auth.uid(), 'admin.signed_in', 'admin_sessions', session_record_id,
      jsonb_build_object('mfa_verified', coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
    );
  end if;

  return session_record_id;
end;
$$;

create or replace function public.close_admin_session()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_identifier uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  closed_session_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Accès administrateur requis';
  end if;

  update public.admin_sessions
  set revoked_at = now(), last_seen_at = now()
  where user_id = auth.uid()
    and auth_session_id is not distinct from session_identifier
    and revoked_at is null
  returning id into closed_session_id;

  if closed_session_id is not null then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    values (auth.uid(), 'admin.signed_out', 'admin_sessions', closed_session_id, '{}'::jsonb);
  end if;

  return closed_session_id is not null;
end;
$$;

revoke all on function public.record_admin_session(text) from public, anon;
revoke all on function public.close_admin_session() from public, anon;
grant execute on function public.record_admin_session(text) to authenticated;
grant execute on function public.close_admin_session() to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_verified boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role and old.id = auth.uid() then
    raise exception 'Impossible de modifier son propre rôle';
  end if;
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'Le changement de rôle nécessite un Super Admin';
  end if;
  if new.is_suspended is distinct from old.is_suspended
    and not public.has_admin_permission('users.suspend')
  then
    raise exception 'Permission users.suspend requise';
  end if;

  if new.account_status is distinct from old.account_status then
    if old.account_status = 'email_unverified' and new.account_status = 'active' then
      select email_confirmed_at is not null into identity_verified from auth.users where id = old.id;
    elsif old.account_status = 'phone_unverified' and new.account_status = 'active' then
      select phone_confirmed_at is not null into identity_verified from auth.users where id = old.id;
    end if;
    if not identity_verified then
      raise exception 'Transition de compte interdite ou identité non vérifiée';
    end if;
  end if;

  if (old.terms_accepted_at is not null and new.terms_accepted_at is distinct from old.terms_accepted_at)
    or (old.privacy_accepted_at is not null and new.privacy_accepted_at is distinct from old.privacy_accepted_at)
  then
    raise exception 'Les consentements légaux sont immuables';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_privileges() from public, anon, authenticated;

create or replace function public.protect_provider_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.verified_at is not null then
      raise exception 'Un nouveau profil prestataire doit être créé en brouillon';
    end if;
  elsif new.status is distinct from old.status
    or new.verified_at is distinct from old.verified_at
    or new.average_rating is distinct from old.average_rating
    or new.review_count is distinct from old.review_count
  then
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
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or public.has_admin_permission('documents.review')
  then
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
    or new.reviewed_at is distinct from old.reviewed_at
  then
    raise exception 'La revue des justificatifs nécessite la permission documents.review';
  end if;
  return new;
end;
$$;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if old.role is distinct from new.role and old.id = auth.uid() then
    raise exception 'Impossible de modifier son propre rôle';
  end if;
  if old.role is distinct from new.role and not public.is_super_admin() then
    raise exception 'Le rôle ne peut être modifié que par un Super Admin';
  end if;
  if old.is_suspended is distinct from new.is_suspended
    and not public.has_admin_permission('users.suspend')
  then
    raise exception 'Permission users.suspend requise';
  end if;
  return new;
end;
$$;

drop policy if exists "profiles public approved providers or self" on public.profiles;
create policy "profiles scoped read" on public.profiles for select using (
  id = auth.uid()
  or public.has_admin_permission('users.read')
  or exists (
    select 1 from public.provider_profiles provider
    where provider.profile_id = profiles.id and provider.status = 'approved'
  )
);

drop policy if exists "profiles update self or admin" on public.profiles;
create policy "profiles scoped update" on public.profiles for update
using (id = auth.uid() or public.has_admin_permission('users.update'))
with check (id = auth.uid() or public.has_admin_permission('users.update'));

drop policy if exists "client profile own or admin" on public.client_profiles;
create policy "client profiles scoped read" on public.client_profiles for select using (
  profile_id = auth.uid() or public.has_admin_permission('users.read')
);
create policy "client profiles scoped insert" on public.client_profiles for insert with check (
  profile_id = auth.uid() or public.has_admin_permission('users.update')
);
create policy "client profiles scoped update" on public.client_profiles for update
using (profile_id = auth.uid() or public.has_admin_permission('users.update'))
with check (profile_id = auth.uid() or public.has_admin_permission('users.update'));
create policy "client profiles scoped delete" on public.client_profiles for delete using (
  profile_id = auth.uid() or public.has_admin_permission('users.update')
);

drop policy if exists "approved providers readable" on public.provider_profiles;
create policy "provider profiles scoped read" on public.provider_profiles for select using (
  status = 'approved' or profile_id = auth.uid() or public.has_admin_permission('providers.read')
);

drop policy if exists "providers manage own profile" on public.provider_profiles;
create policy "providers insert own profile" on public.provider_profiles for insert with check (profile_id = auth.uid());
create policy "providers update own profile" on public.provider_profiles for update
using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "providers delete own profile" on public.provider_profiles for delete using (profile_id = auth.uid());

drop policy if exists "provider documents own or admin" on public.provider_documents;
create policy "provider documents scoped read" on public.provider_documents for select using (
  provider_id = auth.uid() or public.has_admin_permission('documents.review')
);
create policy "provider documents owner insert" on public.provider_documents for insert with check (provider_id = auth.uid());
create policy "provider documents owner update" on public.provider_documents for update
using (provider_id = auth.uid()) with check (provider_id = auth.uid());
create policy "provider documents owner delete" on public.provider_documents for delete using (provider_id = auth.uid());

drop policy if exists "categories public read" on public.categories;
create policy "categories public or authorized read" on public.categories for select using (
  is_active or public.has_admin_permission('categories.manage')
);
drop policy if exists "categories admin write" on public.categories;
create policy "categories authorized write" on public.categories for all
using (public.has_admin_permission('categories.manage'))
with check (public.has_admin_permission('categories.manage'));

drop policy if exists "services public read" on public.services;
create policy "services public or authorized read" on public.services for select using (
  is_active or public.has_admin_permission('categories.manage')
);
drop policy if exists "services admin write" on public.services;
create policy "services authorized write" on public.services for all
using (public.has_admin_permission('categories.manage'))
with check (public.has_admin_permission('categories.manage'));

drop policy if exists "provider categories owner write" on public.provider_categories;
create policy "provider categories scoped write" on public.provider_categories for all
using (provider_id = auth.uid() or public.has_admin_permission('categories.manage'))
with check (provider_id = auth.uid() or public.has_admin_permission('categories.manage'));

drop policy if exists "provider services public read" on public.provider_services;
create policy "provider services scoped read" on public.provider_services for select using (
  is_active or provider_id = auth.uid() or public.has_admin_permission('categories.manage')
);
drop policy if exists "provider services owner write" on public.provider_services;
create policy "provider services scoped write" on public.provider_services for all
using (provider_id = auth.uid() or public.has_admin_permission('categories.manage'))
with check (provider_id = auth.uid() or public.has_admin_permission('categories.manage'));

drop policy if exists "portfolio owner write" on public.portfolio_items;
create policy "portfolio owner write" on public.portfolio_items for all
using (provider_id = auth.uid()) with check (provider_id = auth.uid());
drop policy if exists "areas owner write" on public.service_areas;
create policy "areas owner write" on public.service_areas for all
using (provider_id = auth.uid()) with check (provider_id = auth.uid());
drop policy if exists "availability owner write" on public.availability_rules;
create policy "availability owner write" on public.availability_rules for all
using (provider_id = auth.uid()) with check (provider_id = auth.uid());
drop policy if exists "exceptions owner write" on public.availability_exceptions;
create policy "exceptions owner write" on public.availability_exceptions for all
using (provider_id = auth.uid()) with check (provider_id = auth.uid());

drop policy if exists "booking members read" on public.bookings;
create policy "booking members or authorized read" on public.bookings for select using (
  client_id = auth.uid() or provider_id = auth.uid() or public.has_admin_permission('bookings.read')
);
drop policy if exists "booking members update" on public.bookings;
create policy "booking members or authorized update" on public.bookings for update
using (client_id = auth.uid() or provider_id = auth.uid() or public.has_admin_permission('bookings.update'))
with check (client_id = auth.uid() or provider_id = auth.uid() or public.has_admin_permission('bookings.update'));

drop policy if exists "booking history members read" on public.booking_status_history;
create policy "booking history scoped read" on public.booking_status_history for select using (
  exists (
    select 1 from public.bookings booking
    where booking.id = booking_id
      and (booking.client_id = auth.uid() or booking.provider_id = auth.uid() or public.has_admin_permission('bookings.read'))
  )
);

drop policy if exists "visible reviews public" on public.reviews;
create policy "reviews scoped read" on public.reviews for select using (
  is_visible or client_id = auth.uid() or provider_id = auth.uid() or public.has_admin_permission('reviews.moderate')
);
drop policy if exists "review participants update" on public.reviews;
create policy "reviews scoped update" on public.reviews for update
using (client_id = auth.uid() or provider_id = auth.uid() or public.has_admin_permission('reviews.moderate'))
with check (client_id = auth.uid() or provider_id = auth.uid() or public.has_admin_permission('reviews.moderate'));

drop policy if exists "conversation members read" on public.conversations;
create policy "conversation members or support read" on public.conversations for select using (
  public.is_conversation_member(id) or public.has_admin_permission('support.manage')
);
drop policy if exists "memberships member read" on public.conversation_members;
create policy "memberships member or support read" on public.conversation_members for select using (
  public.is_conversation_member(conversation_id) or public.has_admin_permission('support.manage')
);
drop policy if exists "messages member read" on public.messages;
create policy "messages member or support read" on public.messages for select using (
  public.is_conversation_member(conversation_id) or public.has_admin_permission('support.manage')
);

drop policy if exists "payments booking members read" on public.payments;
create policy "payments scoped read" on public.payments for select using (
  public.has_admin_permission('payments.read')
  or exists (
    select 1 from public.bookings booking
    where booking.id = booking_id and (booking.client_id = auth.uid() or booking.provider_id = auth.uid())
  )
);

drop policy if exists "commissions admin or provider read" on public.platform_commissions;
create policy "commissions scoped read" on public.platform_commissions for select using (
  public.has_admin_permission('payments.read')
  or public.has_admin_permission('commissions.manage')
  or exists (
    select 1 from public.payments payment
    join public.bookings booking on booking.id = payment.booking_id
    where payment.id = payment_id and booking.provider_id = auth.uid()
  )
);

drop policy if exists "audit admin read" on public.audit_logs;
create policy "audit authorized read" on public.audit_logs for select using (
  public.has_admin_permission('audit.read')
);

drop policy if exists "reports reporter or admin read" on public.reports;
create policy "reports reporter or authorized read" on public.reports for select using (
  reporter_id = auth.uid() or public.has_admin_permission('reports.manage')
);
drop policy if exists "reports admin update" on public.reports;
create policy "reports authorized update" on public.reports for update
using (public.has_admin_permission('reports.manage'))
with check (public.has_admin_permission('reports.manage'));

drop policy if exists "notifications own" on public.notifications;
create policy "notifications scoped read" on public.notifications for select using (
  profile_id = auth.uid() or public.has_admin_permission('notifications.send')
);
drop policy if exists "notifications own update" on public.notifications;
create policy "notifications scoped update" on public.notifications for update
using (profile_id = auth.uid() or public.has_admin_permission('notifications.send'))
with check (profile_id = auth.uid() or public.has_admin_permission('notifications.send'));

drop policy if exists "admin roles authorized read" on public.admin_roles;
create policy "admin roles authorized read" on public.admin_roles for select using (
  public.has_admin_permission('roles.manage')
);
drop policy if exists "admin role permissions authorized read" on public.admin_role_permissions;
create policy "admin role permissions authorized read" on public.admin_role_permissions for select using (
  public.has_admin_permission('roles.manage')
);
drop policy if exists "internal notes permission read" on public.internal_notes;
create policy "internal notes permission read" on public.internal_notes for select using (
  public.has_admin_permission('support.manage') or public.has_admin_permission('reports.manage')
);
drop policy if exists "internal notes permission insert" on public.internal_notes;
create policy "internal notes permission insert" on public.internal_notes for insert with check (
  created_by = auth.uid()
  and (public.has_admin_permission('support.manage') or public.has_admin_permission('reports.manage'))
);

drop policy if exists "wallet owner read" on public.wallets;
create policy "wallet owner or finance read" on public.wallets for select using (
  professional_id = auth.uid() or public.has_admin_permission('payments.read')
);
drop policy if exists "invoice parties read" on public.invoices;
create policy "invoice parties or finance read" on public.invoices for select using (
  customer_id = auth.uid() or professional_id = auth.uid() or public.has_admin_permission('payments.read')
);
drop policy if exists "financial audit admin read" on public.financial_audit_log;
create policy "financial audit authorized read" on public.financial_audit_log for select using (
  public.has_admin_permission('audit.read') or public.has_admin_permission('payments.read')
);
drop policy if exists "financial security admin read" on public.financial_security_events;
create policy "financial security authorized read" on public.financial_security_events for select using (
  public.has_admin_permission('audit.read') or public.has_admin_permission('payments.read')
);
drop policy if exists "reconciliation runs admin read" on public.reconciliation_runs;
create policy "reconciliation runs authorized read" on public.reconciliation_runs for select using (
  public.has_admin_permission('payments.read')
);
drop policy if exists "reconciliation items admin read" on public.reconciliation_items;
create policy "reconciliation items authorized read" on public.reconciliation_items for select using (
  public.has_admin_permission('payments.read')
);

drop policy if exists "account roles own read" on public.account_roles;
create policy "account roles scoped read" on public.account_roles for select using (
  profile_id = auth.uid() or public.has_admin_permission('users.read')
);
drop policy if exists "professional onboarding own read" on public.professional_onboarding;
create policy "professional onboarding scoped read" on public.professional_onboarding for select using (
  provider_id = auth.uid() or public.has_admin_permission('providers.read') or public.has_admin_permission('documents.review')
);
drop policy if exists "deletion requests own read" on public.account_deletion_requests;
drop policy if exists "deletion requests owner read" on public.account_deletion_requests;
create policy "deletion requests scoped read" on public.account_deletion_requests for select using (
  profile_id = auth.uid() or public.has_admin_permission('users.update')
);
drop policy if exists "activity owner read" on public.user_activity_history;
create policy "activity scoped read" on public.user_activity_history for select using (
  profile_id = auth.uid() or public.has_admin_permission('users.read')
);

drop policy if exists "published posts public read" on public.posts;
create policy "published posts scoped read" on public.posts for select using (
  (status = 'published' and visibility = 'public') or author_id = auth.uid() or public.has_admin_permission('content.manage')
);
drop policy if exists "authors manage own posts" on public.posts;
create policy "authors or content managers manage posts" on public.posts for all
using (author_id = auth.uid() or public.has_admin_permission('content.manage'))
with check (author_id = auth.uid() or public.has_admin_permission('content.manage'));
drop policy if exists "comments own update" on public.post_comments;
create policy "comments author or moderator update" on public.post_comments for update
using (author_id = auth.uid() or public.has_admin_permission('reviews.moderate'))
with check (author_id = auth.uid() or public.has_admin_permission('reviews.moderate'));
drop policy if exists "comments own delete" on public.post_comments;
create policy "comments author or moderator delete" on public.post_comments for delete using (
  author_id = auth.uid() or public.has_admin_permission('reviews.moderate')
);

drop policy if exists "providers manage own documents" on storage.objects;
create policy "providers or reviewers read documents" on storage.objects for select using (
  bucket_id = 'provider-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.has_admin_permission('documents.review'))
);
create policy "providers insert own documents" on storage.objects for insert with check (
  bucket_id = 'provider-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "providers update own documents" on storage.objects for update
using (
  bucket_id = 'provider-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'provider-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "providers delete own documents" on storage.objects for delete using (
  bucket_id = 'provider-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
