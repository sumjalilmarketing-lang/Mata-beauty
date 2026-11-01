begin;

create or replace function public.notify_booking_status_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_title text; event_body text; zone text;
begin
  if new.status is not distinct from old.status and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at then return new; end if;
  -- Preserve the pre-existing Dakar scheduling convention for legacy records
  -- until their owners explicitly set an establishment timezone.
  select coalesce(nullif(b.timezone,''),nullif(p.timezone,''),'Africa/Dakar')
    into zone from public.provider_profiles p left join public.businesses b on b.owner_id=p.profile_id and b.id=new.business_id
    where p.profile_id=new.provider_id;
  zone:=coalesce(zone,'UTC');
  event_title:=case when new.status='confirmed' and old.status is distinct from new.status then 'Votre rendez-vous est confirmé'
    when new.status in ('cancelled_by_client','cancelled_by_provider') then 'Rendez-vous annulé'
    when new.status='completed' then 'Prestation terminée' when new.status='in_progress' then 'Prestation commencée'
    else 'Rendez-vous modifié' end;
  event_body:=event_title||' : '||to_char(new.starts_at at time zone zone,'DD/MM/YYYY à HH24:MI')||' ('||zone||').';
  insert into public.notifications(profile_id,kind,title,body,data)
  select recipient,'booking_status_changed',event_title,event_body,jsonb_build_object('booking_id',new.id,'status',new.status,'href',prefix||'/bookings#booking-'||new.id::text)
  from (values(new.client_id,'/app'),(new.provider_id,'/pro')) recipients(recipient,prefix);
  return new;
end $$;
revoke all on function public.notify_booking_status_changed() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
