begin;
alter table public.hr_events add column before_data jsonb,add column after_data jsonb;
alter table public.hr_events alter column created_at set default clock_timestamp();
create function public.hr_snapshot_event()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.item_id is null then
 select after_data into new.before_data from public.hr_events where employee_id=new.employee_id and item_id is null order by created_at desc,id desc limit 1;
 select to_jsonb(e)into new.after_data from public.hr_employees e where e.id=new.employee_id;
 else
 select after_data into new.before_data from public.hr_events where item_id=new.item_id order by created_at desc,id desc limit 1;
 select to_jsonb(i)into new.after_data from public.hr_items i where i.id=new.item_id;
 end if;
 return new;
end;$$;
revoke all on function public.hr_snapshot_event()from public,anon,authenticated;
create trigger hr_event_snapshots before insert on public.hr_events for each row execute function public.hr_snapshot_event();
commit;
