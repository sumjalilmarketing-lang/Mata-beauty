import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

let db: PGlite;
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const migration = '20261107001959_reconcile_financial_ledger.sql';
async function webhook(status: string, event = status, amount = 10000) {
  return db.query<{ result: string }>(`select public.process_verified_payment_webhook('mock','fixture',$1,$2,$3,'XOF','hash','ip',now(),$4) result`, [event, status, amount, id(9)]);
}
async function balances() {
  return (await db.query<{ held: number; available: number }>(`select coalesce(sum(amount)filter(where status='held'),0)::int held,coalesce(sum(amount)filter(where status='available'),0)::int available from public.wallet_ledger`)).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
    create type public.payment_status as enum('pending','authorized','paid','held','available','payout_pending','partially_refunded','refunded','disputed','failed','cancelled');
    create table public.bookings(id uuid primary key,client_id uuid,provider_id uuid,status text);
    create table public.payments(id uuid primary key,booking_id uuid references public.bookings,professional_id uuid,provider text,provider_reference text,amount integer,currency text,professional_net_amount integer,refunded_amount integer default 0,payment_status public.payment_status,paid_at timestamptz,confirmed_at timestamptz,last_provider_checked_at timestamptz,internal_reference text);
    create table public.wallets(id uuid primary key default gen_random_uuid(),professional_id uuid,currency text,updated_at timestamptz,unique(professional_id,currency));
    create table public.wallet_ledger(id uuid primary key default gen_random_uuid(),wallet_id uuid,payment_id uuid,booking_id uuid,transaction_type text,amount integer check(amount<>0),status text,reference text unique,metadata jsonb);
    create table public.refunds(payment_id uuid,amount integer,status text);
    create table public.payment_events(payment_id uuid,event_type text,previous_status text,new_status text,provider_event_id text unique,provider text,provider_reference text,amount integer,currency text,occurred_at timestamptz,processed_at timestamptz,signature_valid boolean,source_ip_hash text,payload_hash_sha256 text,outcome text,raw_payload_reference text);
    create table public.financial_audit_log(request_id uuid,actor_kind text,action text,transaction_id uuid,transaction_reference text,source_ip_hash text,previous_state jsonb,new_state jsonb);
  `);
  await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('truncate public.financial_audit_log,public.payment_events,public.wallet_ledger,public.refunds,public.wallets,public.payments,public.bookings cascade');
  await db.query(`insert into public.bookings values($1,$2,$3,'completed')`, [id(1),id(2),id(3)]);
  await db.query(`insert into public.payments(id,booking_id,professional_id,provider,provider_reference,amount,currency,professional_net_amount,payment_status,internal_reference)values($1,$2,$3,'mock','fixture',10000,'XOF',9000,'pending','fixture')`, [id(4),id(1),id(3)]);
  await webhook('paid');
});
it('full refund removes held funds and duplicate delivery creates no extra ledger entry', async () => {
  await webhook('refunded');
  expect(await balances()).toEqual({ held: 0, available: 0 });
  expect((await webhook('refunded')).rows[0].result).toBe('duplicate');
  expect((await db.query('select * from public.wallet_ledger')).rows).toHaveLength(2);
});
it('full refund removes released funds', async () => {
  await db.query('select public.release_payment_funds($1,$2)', [id(1),id(3)]);
  expect(await balances()).toEqual({ held: 0, available: 9000 });
  await webhook('refunded');
  expect(await balances()).toEqual({ held: 0, available: 0 });
});
it('partial refund fails closed without a settled server-side amount', async () => {
  await expect(webhook('partially_refunded')).rejects.toThrow('Montant partiel');
  expect(await balances()).toEqual({ held: 9000, available: 0 });
  expect((await db.query("select * from public.payment_events where new_status='partially_refunded'")).rows).toHaveLength(0);
});
it('partial uses settled cumulative refunds and a full refund clears the rounding remainder', async () => {
  await db.query(`insert into public.refunds values($1,3333,'paid'),($1,1000,'requested')`, [id(4)]);
  await webhook('partially_refunded');
  expect(await balances()).toEqual({ held: 6001, available: 0 });
  expect((await db.query<{ refunded_amount: number }>('select refunded_amount from public.payments')).rows[0].refunded_amount).toBe(3333);
  await webhook('refunded');
  expect(await balances()).toEqual({ held: 0, available: 0 });
});
it('original invoice amount remains mandatory for a refund webhook', async () => {
  await expect(webhook('refunded','wrong-amount',3333)).rejects.toThrow('Montant ou devise');
  expect(await balances()).toEqual({ held: 9000, available: 0 });
});
it('a financial dispute freezes released funds and blocks release', async () => {
  await db.query('select public.release_payment_funds($1,$2)', [id(1),id(3)]);
  await webhook('disputed');
  expect(await balances()).toEqual({ held: 9000, available: 0 });
  await expect(db.query('select public.release_payment_funds($1,$2)', [id(1),id(3)])).rejects.toThrow();
  await webhook('disputed');
  expect(await balances()).toEqual({ held: 9000, available: 0 });
});
it('a booking dispute after release atomically freezes funds; repeated status update is harmless', async () => {
  await db.query('select public.release_payment_funds($1,$2)', [id(1),id(3)]);
  await db.query("update public.bookings set status='disputed' where id=$1", [id(1)]);
  expect(await balances()).toEqual({ held: 9000, available: 0 });
  await db.query("update public.bookings set status='disputed' where id=$1", [id(1)]);
  expect(await balances()).toEqual({ held: 9000, available: 0 });
  expect((await db.query<{ payment_status: string }>('select payment_status from public.payments')).rows[0].payment_status).toBe('disputed');
});
it('a dispute before release blocks the release and retains held funds', async () => {
  await db.query("update public.bookings set status='disputed' where id=$1", [id(1)]);
  await expect(db.query('select public.release_payment_funds($1,$2)', [id(1),id(3)])).rejects.toThrow('Prestation non libérable');
  expect(await balances()).toEqual({ held: 9000, available: 0 });
});
it('pending refunds block release and internal helpers are not executable by authenticated users', async () => {
  await db.query(`insert into public.refunds values($1,1000,'requested')`, [id(4)]);
  await expect(db.query('select public.release_payment_funds($1,$2)', [id(1),id(3)])).rejects.toThrow('Remboursement');
  const permissions = await db.query<{ allowed: boolean }>(`select has_function_privilege('authenticated','payment_private.reconcile_payment_ledger(uuid,text,boolean)','execute') allowed`);
  expect(permissions.rows[0].allowed).toBe(false);
});
it('subsequent settled partial refunds use cumulative rounding, then full refund clears all funds', async () => {
  await db.query(`insert into public.refunds values($1,3333,'paid')`, [id(4)]);
  await webhook('partially_refunded','partial-one');
  await db.query(`insert into public.refunds values($1,3333,'paid')`, [id(4)]);
  await webhook('partially_refunded','partial-two');
  expect(await balances()).toEqual({ held: 3001, available: 0 });
  await expect(webhook('partially_refunded','unsettled-next')).rejects.toThrow('Montant partiel');
  expect(await balances()).toEqual({ held: 3001, available: 0 });
  await webhook('refunded');
  expect(await balances()).toEqual({ held: 0, available: 0 });
});
it('a verified refund can settle a booking-disputed payment without reopening available funds', async () => {
  await db.query('select public.release_payment_funds($1,$2)', [id(1),id(3)]);
  await db.query("update public.bookings set status='disputed' where id=$1", [id(1)]);
  await webhook('refunded');
  expect(await balances()).toEqual({ held: 0, available: 0 });
});
it('migration keeps sandbox attachment unchanged and locks booking before payment in both entrypoints', async () => {
  const sql = await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8');
  expect(sql).not.toContain('attach_payment_provider');
  const webhookBody = sql.slice(sql.indexOf('create or replace function public.process_verified_payment_webhook'),sql.indexOf('create or replace function public.release_payment_funds'));
  const releaseBody = sql.slice(sql.indexOf('create or replace function public.release_payment_funds'),sql.indexOf('create or replace function payment_private.freeze_disputed_booking'));
  expect(webhookBody.indexOf('where id=target_booking for update')).toBeLessThan(webhookBody.indexOf('provider_reference=target_provider_reference for update'));
  expect(releaseBody.indexOf("status='completed' for update")).toBeLessThan(releaseBody.indexOf('for update of p'));
});
for (const withWallet of [false,true]) {
  it(`legacy funded payment with no ledger and wallet=${withWallet} can be disputed without inventing funds`, async () => {
    await db.exec('delete from public.wallet_ledger');
    if (!withWallet) await db.exec('delete from public.wallets');
    await db.query("update public.bookings set status='disputed' where id=$1", [id(1)]);
    expect((await db.query<{payment_status:string}>('select payment_status from public.payments')).rows[0].payment_status).toBe('disputed');
    expect((await db.query('select * from public.wallet_ledger')).rows).toHaveLength(0);
  });
  it(`legacy funded payment with no ledger and wallet=${withWallet} accepts verified refund without backfill`, async () => {
    await db.exec('delete from public.wallet_ledger');
    if (!withWallet) await db.exec('delete from public.wallets');
    await webhook('refunded');
    expect((await db.query<{payment_status:string}>('select payment_status from public.payments')).rows[0].payment_status).toBe('refunded');
    expect((await db.query('select * from public.wallet_ledger')).rows).toHaveLength(0);
  });
}
it('existing incomplete ledger still fails closed rather than inventing credits', async () => {
  await db.exec('update public.wallet_ledger set amount=5000');
  await expect(db.query("update public.bookings set status='disputed' where id=$1",[id(1)])).rejects.toThrow('Solde comptable incomplet');
  expect((await db.query<{status:string}>('select status from public.bookings')).rows[0].status).toBe('completed');
});
it('release refuses a legacy wallet without held accounting entries', async () => {
  await db.exec('delete from public.wallet_ledger');
  await expect(db.query('select public.release_payment_funds($1,$2)',[id(1),id(3)])).rejects.toThrow('Solde comptable incomplet');
  expect((await db.query('select * from public.wallet_ledger')).rows).toHaveLength(0);
});
it('a verified refund also refuses an inconsistent existing ledger atomically', async () => {
  await db.exec('update public.wallet_ledger set amount=5000');
  await expect(webhook('refunded')).rejects.toThrow('Solde comptable incomplet');
  expect((await db.query<{payment_status:string}>('select payment_status from public.payments')).rows[0].payment_status).toBe('paid');
});
