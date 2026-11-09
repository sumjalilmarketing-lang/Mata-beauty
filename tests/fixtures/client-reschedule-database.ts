import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111", client = "66666666-6666-4666-8666-666666666666";
const service = "22222222-2222-4222-8222-222222222222", booking = "33333333-3333-4333-8333-333333333333";
const business = "44444444-4444-4444-8444-444444444444", other = "55555555-5555-4555-8555-555555555555";
const day = "(current_date+7)";
const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

export async function createClientRescheduleDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema booking_private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function public.is_admin() returns boolean language sql as $$select false$$;
    create function public.has_admin_permission(text) returns boolean language sql as $$select false$$;
    create function booking_private.active_staff_permission(uuid,uuid,text) returns boolean language sql as $$select false$$;
    create table public.profiles(id uuid primary key,role text,account_status text,is_suspended boolean);
    create table public.account_roles(profile_id uuid,role text);
    create table public.provider_profiles(profile_id uuid primary key,status text);
    create table public.businesses(id uuid primary key,owner_id uuid,status text,is_active boolean,archived_at timestamptz);
    create table public.provider_services(id uuid primary key,provider_id uuid,business_id uuid,duration_minutes integer,is_active boolean,archived_at timestamptz,status text);
    create table public.availability_rules(provider_id uuid,weekday smallint,starts_at time,ends_at time,slot_interval_minutes integer,valid_from date,valid_until date);
    create table public.business_hours(business_id uuid,weekday smallint,opens_at time,closes_at time,is_closed boolean);
    create table public.availability_exceptions(provider_id uuid,starts_at timestamptz,ends_at timestamptz,is_available boolean);
    create table public.business_closures(business_id uuid,starts_at timestamptz,ends_at timestamptz);
    create table public.payments(id uuid primary key,booking_id uuid,payment_status text);
    create table public.bookings(id uuid primary key,client_id uuid,provider_id uuid,provider_service_id uuid,business_id uuid,
      collaborator_id uuid,collaborator_name text,collaborator_avatar_url text,assignment_reason text,
      starts_at timestamptz,ends_at timestamptz,resource_busy_until timestamptz,status text,
      location_mode text,appointment_address text,total_amount integer,currency text,client_note text,updated_at timestamptz);
    create table public.collaborators(id uuid,business_id uuid,display_name text,title text,is_active boolean,archived_at timestamptz,avatar_url text,buffer_minutes integer);
    create function public.current_collaborator_access() returns table(business_id uuid) language sql as $$select null::uuid where false$$;
    create function booking_private.provider_timezone(uuid,uuid) returns text language sql as $$select 'Africa/Dakar'::text$$;
    create function booking_private.minimum_booking_notice() returns integer language sql as $$select 60$$;
    create function booking_private.can_assign(uuid,uuid,timestamptz,timestamptz,uuid) returns boolean language sql as $$select false$$;
    create function booking_private.employee_windows(uuid,date) returns table(window_start timestamptz,window_end timestamptz,interval_minutes integer) language sql as $$select null::timestamptz,null::timestamptz,30 where false$$;
    grant usage on schema public,booking_private,auth to authenticated;
    grant select on public.profiles,public.businesses to authenticated;
    grant select,update on public.bookings to authenticated;
    alter table public.bookings enable row level security;
    create policy members on public.bookings to authenticated using(client_id=auth.uid() or provider_id=auth.uid()) with check(client_id=auth.uid() or provider_id=auth.uid());
    insert into public.profiles values('${owner}','provider','active',false),('${client}','client','active',false),('${other}','client','active',false);
    insert into public.provider_profiles values('${owner}','approved');
    insert into public.businesses values('${business}','${owner}','approved',true,null);
    insert into public.provider_services values('${service}','${owner}','${business}',30,true,null,'published');
    insert into public.business_hours select '${business}',extract(dow from ${day})::smallint,'09:00','15:00',false;
    insert into public.bookings(id,client_id,provider_id,provider_service_id,business_id,starts_at,ends_at,resource_busy_until,status,total_amount,currency)
      values('${booking}','${client}','${owner}','${service}','${business}',${day}+time '09:00',${day}+time '10:30',${day}+time '11:00','confirmed',15000,'XOF');
    select set_config('test.user','${client}',false);
  `);
  const slotsSql = await migration("20261031062239_dst_safe_independent_slots.sql");
  await db.exec(slotsSql.slice(slotsSql.indexOf("create or replace function booking_private.local_schedule_slots"), slotsSql.indexOf("create or replace function booking_private.independent_slots")));
  await db.exec(await migration("20261031180040_enforce_nonteam_business_hours.sql"));
  await db.exec(await readFile(new URL("./audit/booking-validation-before.sql", import.meta.url), "utf8"));
  const audit = await migration("20261103161056_audit_booking_and_legacy_media_guards.sql");
  await db.exec(audit.slice(audit.indexOf("do $migration$"), audit.indexOf("create policy")));
  await db.exec(await migration("20261104171000_owner_booking_reschedule.sql"));
  await db.exec(await migration("20261109122456_independent_reschedule_historical_interval.sql"));
  const salonSql = await migration("20261008170112_employee_booking_assignment.sql");
  await db.exec(salonSql.slice(salonSql.indexOf("create or replace function public.protect_salon_booking_contract()"), salonSql.indexOf("do $$ declare definition text; begin", salonSql.indexOf("create or replace function public.protect_salon_booking_contract()"))));
  await db.exec(`create trigger bookings_protect_salon_contract before update on public.bookings for each row execute function public.protect_salon_booking_contract();
    create trigger bookings_validate before update on public.bookings for each row execute function public.validate_booking_update();`);
  await db.exec(await migration("20261109145111_client_booking_reschedule.sql"));
  return db;
}
