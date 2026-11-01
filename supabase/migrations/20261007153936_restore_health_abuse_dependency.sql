-- Restore only the missing dependency of the existing health screen.
-- No public alert writes and no unrelated launch features are installed.
create table if not exists public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null check (alert_type in ('multiple_signup','spam','fake_provider','fake_booking','fake_review','abusive_upload','forbidden_content','like_manipulation')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  profile_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create or replace function public.detect_launch_abuse()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid; alert_kind text; event_count integer; threshold integer; window_start timestamptz; target_entity uuid; existing_alert uuid;
begin
  if tg_table_name='post_likes' then actor:=new.profile_id; target_entity:=new.post_id; alert_kind:='like_manipulation'; threshold:=60; window_start:=now()-interval '10 minutes'; select count(*) into event_count from public.post_likes where profile_id=actor and created_at>=window_start;
  elsif tg_table_name='posts' then actor:=new.author_id; target_entity:=new.id; alert_kind:='abusive_upload'; threshold:=20; window_start:=now()-interval '1 hour'; select count(*) into event_count from public.posts where author_id=actor and created_at>=window_start;
  elsif tg_table_name='bookings' then actor:=new.client_id; target_entity:=new.id; alert_kind:='fake_booking'; threshold:=10; window_start:=now()-interval '1 hour'; select count(*) into event_count from public.bookings where client_id=actor and created_at>=window_start;
  elsif tg_table_name='reviews' then actor:=new.client_id; target_entity:=new.id; alert_kind:='fake_review'; threshold:=5; window_start:=now()-interval '1 hour'; select count(*) into event_count from public.reviews where client_id=actor and created_at>=window_start;
  else return new; end if;
  if event_count>=threshold then
    perform pg_advisory_xact_lock(hashtextextended('launch-abuse:'||actor::text||':'||alert_kind,0));
    select id into existing_alert from public.fraud_alerts alert where alert.profile_id=actor and alert.alert_type=alert_kind and alert.status in ('open','reviewing') and alert.created_at>=window_start order by created_at desc limit 1 for update;
    if existing_alert is null then
      insert into public.fraud_alerts(alert_type,severity,profile_id,entity_type,entity_id,evidence) values(alert_kind,case when event_count>=threshold*2 then 'critical' else 'high' end,actor,tg_table_name,target_entity,jsonb_build_object('count',event_count,'window_started_at',window_start));
    else
      update public.fraud_alerts set severity=case when severity='critical' or event_count>=threshold*2 then 'critical' else 'high' end,evidence=jsonb_build_object('count',event_count,'window_started_at',window_start) where id=existing_alert;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists launch_post_abuse_alert on public.posts;
create trigger launch_post_abuse_alert after insert on public.posts for each row execute function public.detect_launch_abuse();
drop trigger if exists launch_like_abuse_alert on public.post_likes;
create trigger launch_like_abuse_alert after insert on public.post_likes for each row execute function public.detect_launch_abuse();
drop trigger if exists launch_booking_abuse_alert on public.bookings;
create trigger launch_booking_abuse_alert after insert on public.bookings for each row execute function public.detect_launch_abuse();
drop trigger if exists launch_review_abuse_alert on public.reviews;
create trigger launch_review_abuse_alert after insert on public.reviews for each row execute function public.detect_launch_abuse();


alter table public.fraud_alerts enable row level security;
revoke all on public.fraud_alerts from anon,authenticated;
grant select on public.fraud_alerts to authenticated;
grant all on public.fraud_alerts to service_role;
drop policy if exists "fraud alerts scoped read" on public.fraud_alerts;
drop policy if exists "fraud alerts admin manage" on public.fraud_alerts;
create policy "fraud alerts scoped read" on public.fraud_alerts for select to authenticated using(public.has_admin_permission('reports.manage'));
revoke all on function public.detect_launch_abuse() from public,anon,authenticated;
