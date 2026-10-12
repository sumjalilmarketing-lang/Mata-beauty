-- Older installations may have the RPC/trigger function without its trigger.
-- The after-insert hook atomically creates the legacy thread or validates the
-- supplied direct thread before adding the booking's actual participants.
begin;
do $repair$
declare installed record;
begin
  if to_regprocedure('public.ensure_booking_conversation_on_insert()') is null then
    raise exception 'Conversation foundation must be applied first';
  end if;
  select t.tgname,t.tgenabled into installed from pg_trigger t
    where t.tgrelid='public.bookings'::regclass and not t.tgisinternal
      and t.tgfoid='public.ensure_booking_conversation_on_insert()'::regprocedure
      and t.tgtype=5 order by t.tgname limit 1;
  if found then
    if installed.tgenabled not in ('O','A') then
      execute format('alter table public.bookings enable trigger %I',installed.tgname);
    end if;
  else
    if exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='bookings_create_conversation') then
      raise exception 'Unexpected bookings_create_conversation trigger definition';
    end if;
    create trigger bookings_create_conversation after insert on public.bookings
      for each row execute function public.ensure_booking_conversation_on_insert();
  end if;
end $repair$;
commit;
