import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema booking_private;
    create table public.app_settings(key text primary key,value jsonb);
    insert into public.app_settings values('booking','{"minimum_notice_minutes":60,"cancellation_window_hours":24}');
    create table public.bookings(id integer primary key,starts_at timestamptz,status text);
    insert into public.bookings values(1,now()+interval '10 minutes','pending');
    grant usage on schema public,booking_private to authenticated,anon;
    grant select,insert,update on public.bookings to authenticated;
    create function booking_private.can_assign(uuid,uuid,timestamptz,timestamptz) returns boolean language sql as $$select true$$;
    create function booking_private.independent_slots(uuid,uuid,date,integer) returns table(slot_start timestamptz) language sql as $$
      select c.slot_start from (values(now()+interval '30 minutes'),(now()+interval '60 minutes'),(now()+interval '120 minutes'))c(slot_start)
      where c.slot_start>now() order by c.slot_start
    $$;
    create function public.get_team_available_slots(target_provider_service_id uuid,from_date date,days integer) returns table(slot_start timestamptz) language sql as $$
      select slot.start_at from (select target_provider_service_id as id)s
      cross join (values(now()+interval '30 minutes'),(now()+interval '60 minutes'),(now()+interval '120 minutes'))slot(start_at)
      cross join (select null::uuid as id)c
      where s.id=target_provider_service_id and booking_private.can_assign(s.id,c.id,slot.start_at,slot.start_at+interval '15 minutes')
    $$;
  `);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261104230907_enforce_configured_booking_notice.sql", import.meta.url), "utf8"));
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

async function denied(sql: string) {
  await db.exec("savepoint denied");
  await expect(db.exec(sql)).rejects.toMatchObject({ code: "23514" });
  await db.exec("rollback to savepoint denied;release savepoint denied");
}

it("enforces the notice even for a direct authenticated insert, including the exact boundary", async () => {
  await db.exec("set local role authenticated");
  await denied("insert into public.bookings values(2,now()+interval '59 minutes','pending')");
  await db.exec("insert into public.bookings values(2,now()+interval '60 minutes','pending')");
});
it("preserves existing bookings and status edits, but guards reschedules", async () => {
  await db.exec("update public.bookings set status='confirmed' where id=1");
  await denied("update public.bookings set starts_at=now()+interval '20 minutes' where id=1");
  await db.exec("update public.bookings set starts_at=now()+interval '2 hours' where id=1");
});
it("applies a changed setting to both independent and team slot listing", async () => {
  await db.exec(`update public.app_settings set value='{"minimum_notice_minutes":120,"cancellation_window_hours":48}' where key='booking'`);
  const independent = await db.query("select * from booking_private.independent_slots(null,null,current_date,1)");
  const team = await db.query("select * from public.get_team_available_slots('11111111-1111-4111-8111-111111111111',current_date,1)");
  expect(independent.rows).toHaveLength(1);
  expect(team.rows).toHaveLength(1);
  await denied("insert into public.bookings values(2,now()+interval '119 minutes','pending')");
});
it("keeps the cancellation policy at 48 hours and rejects malformed or out-of-range configuration", async () => {
  expect((await db.query<{value: {cancellation_window_hours: number}}>("select value from public.app_settings where key='booking'")).rows[0].value.cancellation_window_hours).toBe(48);
  for (const value of ["null", "{}", '{"minimum_notice_minutes":-1,"cancellation_window_hours":48}', '{"minimum_notice_minutes":"60","cancellation_window_hours":48}', '{"minimum_notice_minutes":43201,"cancellation_window_hours":48}', '{"minimum_notice_minutes":60,"cancellation_window_hours":24}']) {
    await denied(`update public.app_settings set value='${value}' where key='booking'`);
  }
});
it("does not expose the private settings reader as an authenticated RPC", async () => {
  await db.exec("set local role authenticated");
  await expect(db.query("select booking_private.minimum_booking_notice()")).rejects.toMatchObject({code:"42501"});
});
