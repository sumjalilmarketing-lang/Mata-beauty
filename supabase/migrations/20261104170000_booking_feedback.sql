begin;
-- Separate verified feedback from legacy moderated reviews; never expose sealed
-- feedback or private comments through a permissive legacy SELECT policy.
create table public.booking_reviews (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id),
 reviewer_id uuid not null references public.profiles(id),
 reviewee_id uuid not null references public.profiles(id),
 type text not null check(type in ('client_to_provider','provider_to_client')),
 rating smallint not null check(rating between 1 and 5),
 criteria text[] not null default '{}',
 comment text check(char_length(comment)<=2000),
 visibility text not null default 'public' check(visibility in ('public','internal')),
 created_at timestamptz not null default now(),
 release_at timestamptz not null default now()+interval '48 hours',
 unique(booking_id,type),
 check(criteria <@ array['quality','welcome','punctuality','respect','behaviour']::text[])
);
alter table public.booking_reviews enable row level security;
revoke all on public.booking_reviews from public,anon,authenticated;
-- All mutations and reads go through the narrow functions below, so neither
-- identities nor embargo dates can be forged by callers.
create function booking_private.can_review_booking(target uuid, direction text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookings b join public.profiles p on p.id=auth.uid()
 where b.id=target and b.status='completed' and p.account_status='active' and not p.is_suspended and (
 (direction='client_to_provider' and b.client_id=auth.uid()) or
 (direction='provider_to_client' and (b.provider_id=auth.uid() or exists(select 1 from public.businesses s where s.id=b.business_id and s.owner_id=auth.uid()) or booking_private.active_staff_permission(auth.uid(),b.collaborator_id,'bookings.manage')))));
$$;
revoke all on function booking_private.can_review_booking(uuid,text) from public,anon,authenticated;
create function public.submit_booking_review(target_booking_id uuid,target_type text,target_rating integer,target_comment text default null,target_criteria text[] default '{}',target_visibility text default 'public')
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; review_id uuid;
begin
 -- Lock the booking so duplicate submissions and completion transitions serialize.
 select * into b from public.bookings where id=target_booking_id for update;
 if not coalesce(booking_private.can_review_booking(target_booking_id,target_type),false) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if target_type='client_to_provider' and target_visibility<>'public' then raise exception 'Visibilité invalide'; end if;
 insert into public.booking_reviews(booking_id,reviewer_id,reviewee_id,type,rating,comment,criteria,visibility)
 values(b.id,auth.uid(),case when target_type='client_to_provider' then b.provider_id else b.client_id end,target_type,target_rating,nullif(trim(target_comment),''),target_criteria,target_visibility) returning id into review_id;
 return review_id;
end $$;
revoke all on function public.submit_booking_review(uuid,text,integer,text,text[],text) from public,anon;
grant execute on function public.submit_booking_review(uuid,text,integer,text,text[],text) to authenticated;
create function public.get_booking_reviews(target_booking_id uuid)
returns table(id uuid,reviewer_id uuid,reviewee_id uuid,type text,rating smallint,comment text,criteria text[],visibility text,created_at timestamptz,release_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.id,r.reviewer_id,r.reviewee_id,r.type,r.rating,r.comment,r.criteria,r.visibility,r.created_at,r.release_at
 from public.booking_reviews r where r.booking_id=target_booking_id and (
 r.reviewer_id=auth.uid() or
 (r.visibility='public' and (r.release_at<=now() or exists(select 1 from public.booking_reviews other where other.booking_id=r.booking_id and other.type<>r.type))) or
 (r.visibility='internal' and r.type='provider_to_client' and booking_private.can_review_booking(r.booking_id,'provider_to_client') and (r.release_at<=now() or exists(select 1 from public.booking_reviews other where other.booking_id=r.booking_id and other.type<>r.type)))
 );
$$;
revoke all on function public.get_booking_reviews(uuid) from public;
grant execute on function public.get_booking_reviews(uuid) to anon,authenticated;
-- Notifications are transactional with completion. The trigger only fires on
-- the transition, never on unrelated edits of an already completed booking.
create function booking_private.notify_booking_review_due() returns trigger
language plpgsql security definer set search_path='' as $$
declare staff uuid; owner uuid;
begin
 if new.status='completed' and old.status is distinct from new.status then
 select owner_id into owner from public.businesses where id=new.business_id;
 staff:=booking_private.staff_booking_notification_recipient(new.collaborator_id);
 insert into public.notifications(profile_id,title,body,kind,data)
 select distinct recipient,'Évaluer le rendez-vous','La prestation est terminée. Partagez votre évaluation.','booking_review_due',jsonb_build_object('booking_id',new.id,'href',case when recipient=new.client_id then '/app/bookings' when recipient=staff and recipient is distinct from owner then '/staff/bookings' else '/salon/bookings' end)
 from unnest(array[new.client_id,new.provider_id,owner,staff]) recipient where recipient is not null;
 end if; return new;
end $$;
revoke all on function booking_private.notify_booking_review_due() from public,anon,authenticated;
create trigger booking_review_due after update of status on public.bookings for each row execute function booking_private.notify_booking_review_due();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bookings') then
 alter publication supabase_realtime add table public.bookings;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
