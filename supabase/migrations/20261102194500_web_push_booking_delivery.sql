begin;
create table public.web_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 profile_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048),
 keys jsonb not null,
 sound boolean not null default true,
 created_at timestamptz not null default now()
);
create index web_push_owner on public.web_push_subscriptions(profile_id);
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from public,anon,authenticated;
grant select,delete on public.web_push_subscriptions to authenticated;
grant all on public.web_push_subscriptions to service_role;
create policy "push owner read" on public.web_push_subscriptions for select to authenticated using(profile_id=(select auth.uid()));
create policy "push owner revoke" on public.web_push_subscriptions for delete to authenticated using(profile_id=(select auth.uid()));

create table public.web_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.notifications(id) on delete cascade,
 subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','expired')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 lease_token uuid,
 unique(notification_id,subscription_id)
);
create index web_push_pending on public.web_push_deliveries(available_at) where status in ('pending','sending');
alter table public.web_push_deliveries enable row level security;
revoke all on public.web_push_deliveries from public,anon,authenticated;
grant all on public.web_push_deliveries to service_role;

create function public.register_web_push(subscription_endpoint text, subscription_keys jsonb, wants_sound boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing_owner uuid;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and not is_suspended and account_status<>'deleted') then raise exception 'Connexion active requise'; end if;
 if length(subscription_endpoint)>2048 or subscription_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^#[:space:]]+$'
 or coalesce(subscription_keys->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(subscription_keys->>'auth','') !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Abonnement invalide'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select profile_id into existing_owner from public.web_push_subscriptions where endpoint=subscription_endpoint;
 if existing_owner is not null and existing_owner<>actor then raise exception 'Appareil déjà associé'; end if;
 if existing_owner is null and (select count(*) from public.web_push_subscriptions where profile_id=actor)>=5 then raise exception 'Cinq appareils maximum'; end if;
 insert into public.web_push_subscriptions(profile_id,endpoint,keys,sound)
 values(actor,subscription_endpoint,jsonb_build_object('auth',subscription_keys->>'auth','p256dh',subscription_keys->>'p256dh'),wants_sound)
 on conflict(endpoint) do update set sound=excluded.sound,keys=excluded.keys where web_push_subscriptions.profile_id=actor;
end $$;
revoke all on function public.register_web_push(text,jsonb,boolean) from public,anon;
grant execute on function public.register_web_push(text,jsonb,boolean) to authenticated;

create function public.enqueue_web_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind in ('booking_created','booking_status_changed','booking_assignment','booking_reminder') then
  insert into public.web_push_deliveries(notification_id,subscription_id)
  select new.id,s.id from public.web_push_subscriptions s join public.profiles p on p.id=s.profile_id
  where s.profile_id=new.profile_id and not p.is_suspended and p.account_status<>'deleted';
 end if;
 return new;
end $$;
revoke all on function public.enqueue_web_push() from public,anon,authenticated;
create trigger notifications_enqueue_web_push after insert on public.notifications for each row execute function public.enqueue_web_push();

create function public.claim_web_push()
returns table(delivery_id uuid,lease uuid,subscription_id uuid,endpoint text,keys jsonb,sound boolean,notification_id uuid,kind text,data jsonb)
language plpgsql security definer set search_path='' as $$
begin
 -- No backfill: only notifications inserted after explicit device registration.
 update public.web_push_deliveries q set status='expired' from public.notifications n
 where n.id=q.notification_id and q.status in ('pending','sending') and (n.created_at<now()-interval '24 hours' or q.attempts>=5);
 return query
 with selected as (
  select q.id from public.web_push_deliveries q
  join public.web_push_subscriptions s on s.id=q.subscription_id
  join public.profiles p on p.id=s.profile_id
  where q.status in ('pending','sending') and q.available_at<=now() and q.attempts<5
  and not p.is_suspended and p.account_status<>'deleted'
  order by q.available_at for update of q skip locked limit 5
 ), claimed as (
  update public.web_push_deliveries q set status='sending',attempts=q.attempts+1,available_at=now()+interval '2 minutes',lease_token=gen_random_uuid()
  from selected where q.id=selected.id returning q.*
 )
 select q.id,q.lease_token,s.id,s.endpoint,s.keys,s.sound,n.id,n.kind,n.data
 from claimed q join public.web_push_subscriptions s on s.id=q.subscription_id join public.notifications n on n.id=q.notification_id;
end $$;
revoke all on function public.claim_web_push() from public,anon,authenticated;
grant execute on function public.claim_web_push() to service_role;

create function public.finish_web_push(delivery_id uuid,lease uuid,outcome text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if outcome not in ('sent','retry','failed') then raise exception 'Résultat invalide'; end if;
 update public.web_push_deliveries set status=case when outcome='retry' then 'pending' else outcome end,
 available_at=now()+interval '5 minutes',lease_token=null
 where id=delivery_id and lease_token=lease and status='sending';
 -- Keep operational metadata bounded; never store payloads or endpoint errors.
 delete from public.web_push_deliveries q using public.notifications n where q.notification_id=n.id and n.created_at<now()-interval '30 days';
end $$;
revoke all on function public.finish_web_push(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_web_push(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
