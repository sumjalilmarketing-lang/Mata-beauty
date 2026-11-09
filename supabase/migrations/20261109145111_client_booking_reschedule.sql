begin;
set local lock_timeout='5s';

-- Private helpers always bind the target to the verified caller. A payment
-- attempt freezes self-service rescheduling: no paid/refund contract is moved.
create function booking_private.client_reschedule_allowed(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookings b join public.profiles p on p.id=b.client_id
   where b.id=target and b.client_id=auth.uid()
   and (p.role='client' or exists(select 1 from public.account_roles customer
     where customer.profile_id=p.id and customer.role='customer'))
   and p.account_status='active' and not p.is_suspended
   and b.status in ('pending','confirmed') and b.starts_at>now()+interval '48 hours'
   and not exists(select 1 from public.payments payment where payment.booking_id=b.id));
$$;
revoke all on function booking_private.client_reschedule_allowed(uuid) from public,anon;
grant execute on function booking_private.client_reschedule_allowed(uuid) to authenticated;

create function booking_private.client_reschedule_slots(target uuid,target_day date)
returns table(slot_start timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare b public.bookings%rowtype; occupied integer;
begin
 if not booking_private.client_reschedule_allowed(target) then
   raise exception 'Report client non autorisé (préavis de 48 h ou paiement existant)' using errcode='42501';
 end if;
 select * into b from public.bookings where id=target and client_id=auth.uid();
 if target_day is null or target_day<current_date-1 or target_day>current_date+366 then
   raise exception 'Date invalide' using errcode='23514';
 end if;
 if b.collaborator_id is null then
   occupied:=ceil(extract(epoch from (b.ends_at-b.starts_at+
     greatest(coalesce(b.resource_busy_until-b.ends_at,interval '0'),interval '0')))/60)::integer;
   return query select s.slot_start from booking_private.independent_reschedule_slots(
     b.provider_id,b.provider_service_id,target_day,occupied,b.id) s;
 else
   return query select distinct candidate.start_at
   from booking_private.employee_windows(b.collaborator_id,target_day) w
   cross join lateral generate_series(w.window_start,w.window_end-(b.ends_at-b.starts_at),
     make_interval(mins=>w.interval_minutes)) candidate(start_at)
   where candidate.start_at>=now()+make_interval(mins=>booking_private.minimum_booking_notice())
     and booking_private.can_assign(b.provider_service_id,b.collaborator_id,
       candidate.start_at,candidate.start_at+(b.ends_at-b.starts_at),b.id)
   order by candidate.start_at;
 end if;
end $$;
revoke all on function booking_private.client_reschedule_slots(uuid,date) from public,anon;
grant execute on function booking_private.client_reschedule_slots(uuid,date) to authenticated;

create function public.get_client_reschedule_slots(target_booking_id uuid,target_date date)
returns table(slot_start timestamptz)
language sql stable security invoker set search_path='' as $$
 select * from booking_private.client_reschedule_slots(target_booking_id,target_date)
$$;
revoke all on function public.get_client_reschedule_slots(uuid,date) from public,anon;
grant execute on function public.get_client_reschedule_slots(uuid,date) to authenticated;

-- Extend only the reviewed time-change branch. Preserve every existing
-- immutable-field, owner, administrator and status-transition check.
do $patch$
declare original text; marker text; replacement text;
begin
 original:=pg_get_functiondef('public.validate_booking_update()'::regprocedure);
 marker:='  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then';
 if position(marker in original)=0 then raise exception 'Unexpected booking time guard';end if;
 replacement:=marker||E'\n'||$client$
    if auth.uid()=old.client_id and auth.uid() is distinct from old.provider_id then
      if (to_jsonb(new)-array['starts_at','ends_at','updated_at','resource_busy_until'])
          is distinct from (to_jsonb(old)-array['starts_at','ends_at','updated_at','resource_busy_until'])
        or new.ends_at-new.starts_at<>old.ends_at-old.starts_at
        or not booking_private.client_reschedule_allowed(old.id) then
        raise exception 'Report client non autorisé' using errcode='42501';
      end if;
      if not exists(select 1 from booking_private.client_reschedule_slots(old.id,
        (new.starts_at at time zone booking_private.provider_timezone(old.provider_id,old.business_id))::date) s
        where s.slot_start=new.starts_at) then
        raise exception 'Créneau indisponible' using errcode='23P01';
      end if;
      return new;
    end if;
$client$;
 execute replace(original,marker,replacement);
end $patch$;

create function public.reschedule_client_booking(target_booking_id uuid,target_starts_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.bookings%rowtype; owner uuid;
begin
 if auth.uid() is null or target_starts_at is null or not isfinite(target_starts_at) then
   raise exception 'Requête invalide' using errcode='42501';
 end if;
 select provider_id into owner from public.bookings where id=target_booking_id and client_id=auth.uid();
 if owner is null then raise exception 'Accès refusé' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,8108));
 select * into b from public.bookings where id=target_booking_id and client_id=auth.uid() for update;
 if b.id is null then raise exception 'Accès refusé' using errcode='42501';end if;
 if b.starts_at=target_starts_at then
   return jsonb_build_object('id',b.id,'startsAt',b.starts_at,'endsAt',b.ends_at);
 end if;
 if not booking_private.client_reschedule_allowed(b.id) then
   raise exception 'Report client non autorisé' using errcode='42501';
 end if;
 update public.bookings set starts_at=target_starts_at,
   ends_at=target_starts_at+(b.ends_at-b.starts_at) where id=b.id
 returning * into b;
 return jsonb_build_object('id',b.id,'startsAt',b.starts_at,'endsAt',b.ends_at);
end $$;
revoke all on function public.reschedule_client_booking(uuid,timestamptz) from public,anon;
grant execute on function public.reschedule_client_booking(uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
