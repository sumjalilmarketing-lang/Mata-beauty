-- Only accounts created after this migration are eligible; no welcome backfill.
create table public.welcome_email_deliveries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','needs_review')),
  recipient text,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.welcome_email_deliveries enable row level security;
revoke all on public.welcome_email_deliveries from anon, authenticated;
grant all on public.welcome_email_deliveries to service_role;
create policy welcome_delivery_service_only on public.welcome_email_deliveries
  for all to service_role using (true) with check (true);

create function public.queue_welcome_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.welcome_email_deliveries(user_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.queue_welcome_email() from public, anon, authenticated;
create trigger queue_new_account_welcome after insert on auth.users
  for each row execute function public.queue_welcome_email();

create function public.claim_welcome_email(target_user_id uuid)
returns table(recipient text) language plpgsql security definer set search_path = '' as $$
declare delivery public.welcome_email_deliveries%rowtype; confirmed_email text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service only'; end if;
  select u.email into confirmed_email from auth.users u join public.profiles p on p.id=u.id
    where u.id=target_user_id and u.email_confirmed_at is not null
    and not p.is_suspended and p.account_status='active';
  if confirmed_email is null then return; end if;
  select * into delivery from public.welcome_email_deliveries where user_id=target_user_id for update;
  if not found or delivery.status in ('sent','needs_review') then return; end if;
  -- Stop ambiguous retries before Resend's 24-hour idempotency window expires.
  if delivery.first_attempt_at < now()-interval '23 hours' then
    update public.welcome_email_deliveries set status='needs_review' where user_id=target_user_id;
    return;
  end if;
  if delivery.last_attempt_at > now()-interval '2 minutes' then return; end if;
  update public.welcome_email_deliveries set status='sending',
    recipient=coalesce(delivery.recipient,confirmed_email),
    first_attempt_at=coalesce(delivery.first_attempt_at,now()), last_attempt_at=now(), attempts=attempts+1
    where user_id=target_user_id;
  return query select coalesce(delivery.recipient,confirmed_email);
end;
$$;
revoke all on function public.claim_welcome_email(uuid) from public,anon,authenticated;
grant execute on function public.claim_welcome_email(uuid) to service_role;
