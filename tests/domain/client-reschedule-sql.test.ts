import type { PGlite } from "@electric-sql/pglite";
import { createClientRescheduleDatabase } from "../fixtures/client-reschedule-database";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111", client = "66666666-6666-4666-8666-666666666666";
const service = "22222222-2222-4222-8222-222222222222", booking = "33333333-3333-4333-8333-333333333333";
const business = "44444444-4444-4444-8444-444444444444", other = "55555555-5555-4555-8555-555555555555";
const day = "(current_date+7)";
const move = (start = "10:00") => db.query<{ result: { id: string; startsAt: string; endsAt: string } }>(`select public.reschedule_client_booking('${booking}',${day}+time '${start}') as result`);
async function denied(sql: string, code?: string) {
  await db.exec("savepoint rejected");
  if (code) await expect(db.exec(sql)).rejects.toMatchObject({ code });
  else await expect(db.exec(sql)).rejects.toBeDefined();
  await db.exec("rollback to savepoint rejected;release savepoint rejected");
}
beforeAll(async () => { db = await createClientRescheduleDatabase(); }, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
it("reports as the actual client through an invoker RPC and preserves the price, duration, buffer and resource", async () => {
  await db.exec("set local role authenticated");
  const moved = await move();
  expect(moved.rows[0].result.id).toBe(booking);
  const row = (await db.query<{ duration: string; buffer: string; total_amount: number; collaborator_id: null }>(`select ends_at-starts_at as duration,resource_busy_until-ends_at as buffer,total_amount,collaborator_id from public.bookings where id='${booking}'`)).rows[0];
  expect(row).toMatchObject({ duration: "01:30:00", buffer: "00:30:00", total_amount: 15000, collaborator_id: null });
  expect((await move()).rows[0].result).toEqual(moved.rows[0].result);
});
it("permits a provider account acting as a customer through its granted customer role", async () => {
  await db.exec(`update public.profiles set role='provider' where id='${client}';
    insert into public.account_roles values('${client}','customer');set local role authenticated`);
  expect((await move()).rows[0].result.id).toBe(booking);
});
it("rejects a provider account without the customer role", async () => {
  await db.exec(`update public.profiles set role='provider' where id='${client}';set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "42501");
});
it("lists only slots fitting the historical duration and cleanup buffer, ignoring its own previous range", async () => {
  await db.exec("set local role authenticated");
  const rows = await db.query<{ slot_start: string }>(`select slot_start::text from public.get_client_reschedule_slots('${booking}',${day})`);
  expect(rows.rows.some(row => row.slot_start.includes("10:00:00"))).toBe(true);
  expect(rows.rows.some(row => row.slot_start.includes("13:30:00"))).toBe(false);
});
it("rejects another client and an anonymous caller", async () => {
  await db.exec(`select set_config('test.user','${other}',true);set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "42501");
  await db.exec("reset role;set local role anon");
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "42501");
});
it.each(["pending", "paid", "refunded", "disputed", "failed"])("freezes any existing %s payment attempt", async status => {
  await db.exec(`insert into public.payments values('${other}','${booking}','${status}');set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "42501");
});
it("rejects a client report inside 48 hours, including exactly 48 hours", async () => {
  await db.exec(`alter table public.bookings disable trigger user;update public.bookings set starts_at=now()+interval '48 hours';alter table public.bookings enable trigger user;set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "42501");
});
it("rejects inactive accounts, closed booking status and unavailable intervals", async () => {
  await db.exec(`update public.profiles set is_suspended=true where id='${client}';set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "42501");
  await db.exec(`reset role;update public.profiles set is_suspended=false where id='${client}';set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '14:00')`, "23P01");
  await db.exec(`reset role;alter table public.bookings disable trigger user;update public.bookings set status='completed';alter table public.bookings enable trigger user;set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "42501");
});
it("rejects another active booking, manual closure and a new slot below the configured notice", async () => {
  await db.exec(`insert into public.bookings(id,client_id,provider_id,provider_service_id,business_id,starts_at,ends_at,resource_busy_until,status,total_amount,currency)
    values('${other}','${other}','${owner}','${service}','${business}',${day}+time '11:00',${day}+time '12:00',${day}+time '12:00','confirmed',15000,'XOF');set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "23P01");
  await db.exec(`reset role;delete from public.bookings where id='${other}';insert into public.business_closures values('${business}',${day}+time '11:30',${day}+time '12:00');set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "23P01");
  await db.exec(`reset role;delete from public.business_closures;create or replace function booking_private.minimum_booking_notice() returns integer language sql as $$select 11520$$;set local role authenticated`);
  await denied(`select public.reschedule_client_booking('${booking}',${day}+time '10:00')`, "23P01");
});
it("prevents a direct update from smuggling a price, resource or status change alongside the report", async () => {
  await db.exec("set local role authenticated");
  for (const extra of ["total_amount=1", `collaborator_id='${other}'`, "status='completed'", "client_note='changed'"]) {
    await denied(`update public.bookings set starts_at=${day}+time '10:00',ends_at=${day}+time '11:30',${extra} where id='${booking}'`);
  }
});
