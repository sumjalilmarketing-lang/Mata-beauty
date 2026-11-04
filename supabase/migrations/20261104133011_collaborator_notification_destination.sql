begin;
create or replace function public.notify_booking_created() returns trigger
language plpgsql security definer set search_path='' as $$
declare service_name text;
begin
 select title into service_name from public.provider_services where id=new.provider_service_id;
 insert into public.notifications(profile_id,kind,title,body,data) values(new.provider_id,'booking_created','Nouvelle demande de réservation',
 coalesce(service_name,'Prestation')||case when new.collaborator_name is null then ' : une nouvelle réservation attend votre réponse.' else ' : réservation attribuée à '||new.collaborator_name||'.' end,
 jsonb_build_object('booking_id',new.id,'source_post_id',new.source_post_id,'href',case when new.business_id is null then '/pro/bookings#booking-'||new.id else '/salon/bookings#booking-'||new.id end));
 return new;
end $$;
revoke all on function public.notify_booking_created() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
