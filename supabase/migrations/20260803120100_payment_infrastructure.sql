-- Infrastructure financière Mata Beauty. Les écritures sont additives et le
-- fournisseur reste en mode test tant qu'un compte marchand n'est pas validé.

create table if not exists public.payment_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  active boolean not null default false,
  environment text not null default 'test' check (environment in ('test','production')),
  configuration_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_providers (name, code, active, environment, configuration_reference)
values ('Mata Mock', 'mock', true, 'test', 'PAYMENT_PROVIDER_MODE'),
       ('PayTech', 'paytech', false, 'test', 'PAYTECH_API_KEY')
on conflict (code) do nothing;

alter table public.payments drop constraint if exists payments_booking_id_key;
alter table public.payments add column if not exists customer_id uuid references public.profiles(id) on delete restrict;
alter table public.payments add column if not exists professional_id uuid references public.profiles(id) on delete restrict;
alter table public.payments add column if not exists provider text not null default 'mock';
alter table public.payments add column if not exists provider_transaction_id text;
alter table public.payments add column if not exists idempotency_key text;
alter table public.payments add column if not exists gross_amount integer;
alter table public.payments add column if not exists platform_fee integer not null default 0;
alter table public.payments add column if not exists provider_fee integer not null default 0;
alter table public.payments add column if not exists professional_net_amount integer;
alter table public.payments add column if not exists refunded_amount integer not null default 0;
alter table public.payments add column if not exists failure_reason text;
alter table public.payments add column if not exists paid_at timestamptz;
alter table public.payments add column if not exists confirmed_at timestamptz;
alter table public.payments add constraint payments_financial_amounts_check check (
  amount >= 0 and coalesce(gross_amount, amount) >= 0 and platform_fee >= 0 and provider_fee >= 0
  and coalesce(professional_net_amount, amount) >= 0 and refunded_amount between 0 and amount
) not valid;

update public.payments p set
  customer_id = b.client_id,
  professional_id = b.provider_id,
  gross_amount = coalesce(p.gross_amount, p.amount),
  professional_net_amount = coalesce(p.professional_net_amount, p.amount - p.platform_fee - p.provider_fee),
  idempotency_key = coalesce(p.idempotency_key, 'legacy:' || p.id::text)
from public.bookings b where b.id = p.booking_id;

create unique index if not exists payments_idempotency_key_idx on public.payments (idempotency_key) where idempotency_key is not null;
create unique index if not exists payments_provider_reference_idx on public.payments (provider, provider_reference) where provider_reference is not null;
create unique index if not exists payments_one_active_booking_idx on public.payments (booking_id)
  where payment_status in ('pending','authorized','paid');
create index if not exists payments_customer_created_idx on public.payments (customer_id, created_at desc);
create index if not exists payments_professional_created_idx on public.payments (professional_id, created_at desc);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text not null,
  provider_event_id text not null unique,
  raw_payload_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  amount integer not null check (amount > 0),
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'requested' check (status in ('requested','approved','processing','paid','rejected','failed')),
  provider_refund_id text unique,
  approved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.provider_profiles(profile_id) on delete restrict,
  currency char(3) not null default 'XOF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, currency)
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('payment_held','funds_released','refund','payout_requested','payout_paid','adjustment')),
  amount integer not null,
  status text not null check (status in ('pending','held','available','paid','reversed')),
  reference text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (amount <> 0)
);

alter table public.payouts add column if not exists wallet_id uuid references public.wallets(id) on delete restrict;
alter table public.payouts add column if not exists payout_method text;
alter table public.payouts add column if not exists payout_account_reference text;
alter table public.payouts add column if not exists requested_at timestamptz not null default now();
alter table public.payouts add column if not exists processed_at timestamptz;
alter table public.payouts add column if not exists failure_reason text;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  professional_id uuid not null references public.profiles(id) on delete restrict,
  invoice_number text not null unique,
  subtotal integer not null check (subtotal >= 0),
  platform_fee integer not null default 0 check (platform_fee >= 0),
  taxes integer not null default 0 check (taxes >= 0),
  total integer not null check (total >= 0),
  currency char(3) not null default 'XOF',
  invoice_url text,
  created_at timestamptz not null default now()
);

create or replace function public.prevent_financial_ledger_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Le registre financier est immuable'; end;
$$;
drop trigger if exists wallet_ledger_immutable on public.wallet_ledger;
create trigger wallet_ledger_immutable before update or delete on public.wallet_ledger
for each row execute function public.prevent_financial_ledger_mutation();

create or replace function public.process_payment_webhook(
  target_payment_id uuid, target_event_id text, target_status text, target_payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_payment public.payments%rowtype;
  target_wallet_id uuid;
begin
  select * into current_payment from public.payments where id = target_payment_id for update;
  if not found then raise exception 'Paiement introuvable'; end if;
  if exists (select 1 from public.payment_events where provider_event_id = target_event_id) then return; end if;

  update public.payments set
    payment_status = target_status::public.payment_status,
    paid_at = case when target_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
    confirmed_at = case when target_status in ('paid','refunded') then now() else confirmed_at end,
    refunded_amount = case when target_status = 'refunded' then amount else refunded_amount end
  where id = target_payment_id;

  insert into public.payment_events(payment_id,event_type,previous_status,new_status,provider_event_id,raw_payload_reference)
  values (target_payment_id, coalesce(target_payload->>'type','payment_status'), current_payment.payment_status::text,
    target_status, target_event_id, pg_catalog.md5(target_payload::text));

  if target_status = 'paid' then
    insert into public.wallets(professional_id,currency) values (current_payment.professional_id,current_payment.currency)
      on conflict (professional_id,currency) do update set updated_at = now() returning id into target_wallet_id;
    insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference)
      values(target_wallet_id,current_payment.id,current_payment.booking_id,'payment_held',current_payment.professional_net_amount,'held','payment:' || current_payment.id::text)
      on conflict (reference) do nothing;
    update public.bookings set status = 'confirmed' where id = current_payment.booking_id and status = 'pending';
  end if;
end;
$$;
revoke all on function public.process_payment_webhook(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.process_payment_webhook(uuid,text,text,jsonb) to service_role;

create or replace function public.release_payment_funds(target_booking_id uuid, target_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_payment public.payments%rowtype;
  target_wallet_id uuid;
begin
  select p.* into current_payment from public.payments p join public.bookings b on b.id = p.booking_id
  where p.booking_id = target_booking_id and p.payment_status in ('paid','held') and b.status = 'completed' for update of p;
  if not found then raise exception 'Paiement libérable introuvable'; end if;
  select id into target_wallet_id from public.wallets where professional_id = current_payment.professional_id and currency = current_payment.currency;
  if target_wallet_id is null then raise exception 'Portefeuille introuvable'; end if;
  insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference,metadata)
    values(target_wallet_id,current_payment.id,current_payment.booking_id,'funds_released',-current_payment.professional_net_amount,'held','release-held:' || current_payment.id::text,jsonb_build_object('actor_id',target_actor_id))
    on conflict (reference) do nothing;
  insert into public.wallet_ledger(wallet_id,payment_id,booking_id,transaction_type,amount,status,reference,metadata)
    values(target_wallet_id,current_payment.id,current_payment.booking_id,'funds_released',current_payment.professional_net_amount,'available','release-available:' || current_payment.id::text,jsonb_build_object('actor_id',target_actor_id))
    on conflict (reference) do nothing;
  update public.payments set payment_status = 'available', confirmed_at = now() where id = current_payment.id;
end;
$$;
revoke all on function public.release_payment_funds(uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_payment_funds(uuid,uuid) to service_role;

alter table public.payment_providers enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "payments client create test" on public.payments;
create policy "payment providers public active read" on public.payment_providers for select using (active);
create policy "payment events members read" on public.payment_events for select using (
  exists (select 1 from public.payments p where p.id = payment_id and (p.customer_id = auth.uid() or p.professional_id = auth.uid())) or public.is_admin()
);
create policy "refund owners read" on public.refunds for select using (
  requested_by = auth.uid() or exists (select 1 from public.payments p where p.id = payment_id and p.professional_id = auth.uid()) or public.is_admin()
);
create policy "wallet owner read" on public.wallets for select using (professional_id = auth.uid() or public.is_admin());
create policy "wallet ledger owner read" on public.wallet_ledger for select using (
  exists (select 1 from public.wallets w where w.id = wallet_id and w.professional_id = auth.uid()) or public.is_admin()
);
create policy "invoice parties read" on public.invoices for select using (customer_id = auth.uid() or professional_id = auth.uid() or public.is_admin());

create or replace view public.wallet_balances with (security_invoker = true) as
select w.id as wallet_id, w.professional_id, w.currency,
  coalesce(sum(l.amount) filter (where l.status in ('pending','held')),0)::bigint as pending_balance,
  coalesce(sum(l.amount) filter (where l.status = 'available'),0)::bigint as available_balance,
  coalesce(sum(l.amount) filter (where l.transaction_type in ('payment_held','funds_released')),0)::bigint as total_earned,
  abs(coalesce(sum(l.amount) filter (where l.transaction_type = 'payout_paid'),0))::bigint as total_paid_out
from public.wallets w left join public.wallet_ledger l on l.wallet_id = w.id group by w.id;

comment on table public.wallet_ledger is 'Registre comptable append-only. Les statuts held/available représentent une conservation interne, pas un séquestre juridique.';
