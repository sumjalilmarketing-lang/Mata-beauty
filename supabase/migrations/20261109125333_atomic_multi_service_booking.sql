begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

-- One appointment occupies one continuous resource interval. Monetary and
-- duration snapshots are computed by the database, never supplied by clients.
alter table public.bookings add column service_ids uuid[];
alter table public.bookings add column service_snapshot jsonb;
alter table public.bookings add constraint bookings_multi_service_shape check (
  (service_ids is null and service_snapshot is null) or
  (service_ids is not null and service_snapshot is not null and array_ndims(service_ids)=1 and array_lower(service_ids,1)=1
    and cardinality(service_ids) between 1 and 8
    and jsonb_typeof(service_snapshot)='array'
    and jsonb_array_length(service_snapshot)=cardinality(service_ids))
);

create function booking_private.multi_service_quote(ids uuid[],option_ids uuid[] default '{}'::uuid[],location_mode text default 'salon')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.provider_services%rowtype; first_service public.provider_services%rowtype;
  q jsonb; items jsonb:='[]'::jsonb; sid uuid; duration integer:=0;
  amount bigint:=0; base bigint:=0; options bigint:=0; deposit bigint:=0;
begin
  if ids is null or array_ndims(ids)<>1 or array_lower(ids,1)<>1
    or cardinality(ids) not between 1 and 8
    or (select count(distinct id) from unnest(ids) id)<>cardinality(ids) then
    raise exception 'Choisissez de 1 à 8 prestations distinctes' using errcode='22023';
  end if;
  if location_mode is null or location_mode not in ('salon','client_address')
    or (cardinality(ids)>1 and location_mode<>'salon') then
    raise exception 'Le panier multiple est disponible en salon' using errcode='22023';
  end if;
  option_ids:=coalesce(option_ids,'{}'::uuid[]);
  if cardinality(option_ids)>32 or array_ndims(option_ids)>1
    or array_position(option_ids,null) is not null
    or (select count(distinct id) from unnest(option_ids) id)<>cardinality(option_ids)
    or exists(select 1 from unnest(option_ids) requested where not exists(
      select 1 from public.service_options o where o.id=requested and o.is_active and o.provider_service_id=any(ids))) then
    raise exception 'Options de prestation invalides' using errcode='22023';
  end if;
  foreach sid in array ids loop
    select service.* into s from public.provider_services service
    join public.provider_profiles provider on provider.profile_id=service.provider_id
    join public.profiles account on account.id=service.provider_id
    left join public.businesses business on business.id=service.business_id
    where service.id=sid and service.is_active and service.archived_at is null
      and service.status='published' and provider.status='approved'
      and ((location_mode='salon' and provider.service_mode in ('salon','both'))
        or (location_mode='client_address' and provider.service_mode in ('mobile','both')))
      and account.account_status='active' and not account.is_suspended
      and (service.business_id is null or (business.owner_id=service.provider_id
        and business.status='approved' and business.is_active and business.archived_at is null));
    if not found then raise exception 'Prestation indisponible en salon' using errcode='23514'; end if;
    if first_service.id is null then first_service:=s;
    elsif s.provider_id is distinct from first_service.provider_id
      or s.business_id is distinct from first_service.business_id
      or s.currency is distinct from first_service.currency then
      raise exception 'Les prestations doivent appartenir au même établissement et à la même devise' using errcode='22023';
    end if;
    q:=public.calculate_service_quote(s.id,array(select requested from unnest(option_ids) requested
      join public.service_options o on o.id=requested where o.provider_service_id=s.id),null,location_mode);
    duration:=duration+(q->>'duration_minutes')::integer;
    amount:=amount+(q->>'total_amount')::bigint;
    base:=base+(q->>'base_amount')::bigint;
    options:=options+(q->>'options_amount')::bigint;
    deposit:=deposit+(q->>'deposit_amount')::bigint;
    items:=items||jsonb_build_array(jsonb_build_object('id',s.id,'title',s.title||coalesce((select ' ('||string_agg(o.name,', ' order by o.name,o.id)||')'
        from public.service_options o where o.id in(select jsonb_array_elements_text(q->'selected_option_ids')::uuid)),''),
      'duration_minutes',(q->>'duration_minutes')::integer,'price_amount',(q->>'total_amount')::integer,
      'currency',trim(s.currency::text),'business_id',s.business_id,
      'deposit_percentage',coalesce(s.deposit_percentage,0),
      'base_amount',(q->>'base_amount')::integer,'options_amount',(q->>'options_amount')::integer,
      'deposit_amount',(q->>'deposit_amount')::integer,'selected_option_ids',q->'selected_option_ids'));
  end loop;
  if duration not between 15 and 720 or amount not between 0 and 2147483647
    or base not between 0 and 2147483647 or options not between 0 and 2147483647 or deposit not between 0 and amount then
    raise exception 'Durée ou montant cumulé invalide' using errcode='22023';
  end if;
  return jsonb_build_object('providerId',first_service.provider_id,'businessId',first_service.business_id,
    'currency',trim(first_service.currency::text),'durationMinutes',duration,
    'totalAmount',amount,'baseAmount',base,'optionsAmount',options,'depositAmount',deposit,'services',items);
end $$;
revoke all on function booking_private.multi_service_quote(uuid[],uuid[],text) from public,anon,authenticated;

-- Reuse the reviewed DST/opening/closure/notice implementation with a nullable
-- ignore ID. NULL excludes no booking; there is no sentinel UUID bypass.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('booking_private.independent_reschedule_slots(uuid,uuid,date,integer,uuid)'::regprocedure);
  if position('b.id<>ignore_booking' in definition)=0 then raise exception 'Independent slot implementation changed'; end if;
  definition:=replace(definition,'booking_private.independent_reschedule_slots(','booking_private.multi_service_slots(');
  definition:=replace(definition,' STRICT','');
  definition:=replace(definition,'b.id<>ignore_booking','(ignore_booking is null or b.id<>ignore_booking)');
  execute definition;
end $$;
revoke all on function booking_private.multi_service_slots(uuid,uuid,date,integer,uuid) from public,anon,authenticated;

create function booking_private.can_assign_services(ids uuid[],fallback_id uuid,person uuid,starts timestamptz,ends timestamptz,ignore_booking uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(bool_and(booking_private.can_assign(sid,person,starts,ends,ignore_booking)),false)
  from unnest(coalesce(ids,array[fallback_id])) sid
$$;
revoke all on function booking_private.can_assign_services(uuid[],uuid,uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;

create function booking_private.prepare_multi_booking(item public.bookings)
returns public.bookings language plpgsql security definer set search_path='' as $$
declare q jsonb; provider public.provider_profiles%rowtype; business public.businesses%rowtype;
begin
  if auth.uid() is null or item.client_id is distinct from auth.uid()
    or not exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.account_status='active' and not p.is_suspended) then
    raise exception 'Compte client requis' using errcode='42501';
  end if;
  if item.location_mode<>'salon' or item.conversation_quote_id is not null
    or item.promotion_id is not null then
    raise exception 'Le panier multiple utilise les prestations sans option en salon' using errcode='22023';
  end if;
  if item.service_ids is null or array_ndims(item.service_ids)<>1 or array_lower(item.service_ids,1)<>1
    or cardinality(item.service_ids) not between 1 and 8 then
    raise exception 'Sélection de prestations invalide' using errcode='22023';
  end if;
  perform 1 from public.provider_services where id=any(item.service_ids) order by id for share;
  q:=booking_private.multi_service_quote(item.service_ids,item.selected_option_ids);
  if item.provider_service_id is distinct from item.service_ids[1] then
    raise exception 'Prestation principale incohérente' using errcode='22023';
  end if;
  if item.starts_at is null or item.starts_at<now()+make_interval(mins=>booking_private.minimum_booking_notice())
    or item.starts_at>now()+interval '1 year' then
    raise exception 'Date ou préavis invalide' using errcode='23514';
  end if;
  item.provider_id:=(q->>'providerId')::uuid; item.business_id:=(q->>'businessId')::uuid;
  item.ends_at:=item.starts_at+make_interval(mins=>(q->>'durationMinutes')::integer);
  item.total_amount:=(q->>'totalAmount')::integer; item.currency:=q->>'currency';
  item.base_amount:=(q->>'baseAmount')::integer; item.options_amount:=(q->>'optionsAmount')::integer; item.discount_amount:=0;
  item.deposit_amount:=(q->>'depositAmount')::integer;
  item.selected_option_ids:=array(select distinct selected::uuid from jsonb_array_elements(q->'services') line
    cross join lateral jsonb_array_elements_text(line->'selected_option_ids') selected order by selected::uuid);
  item.service_snapshot:=q->'services'; item.status:='pending';
  if length(coalesce(item.client_note,''))>1000 then raise exception 'Note trop longue' using errcode='22023'; end if;
  select * into provider from public.provider_profiles where profile_id=item.provider_id;
  if item.business_id is not null then select * into business from public.businesses where id=item.business_id; end if;
  item.appointment_address:=coalesce(business.address,provider.base_address);
  item.appointment_latitude:=coalesce(business.latitude::double precision,provider.latitude);
  item.appointment_longitude:=coalesce(business.longitude::double precision,provider.longitude);
  item.appointment_place_id:=coalesce(business.location_place_id,provider.location_place_id);
  item.travel_distance_km:=null; item.distance_travel_fee_amount:=0;
  return item;
end $$;
revoke all on function booking_private.prepare_multi_booking(public.bookings) from public,anon,authenticated;

-- Preserve the complete existing mono-service/quote/location contract. Only an
-- explicit multi-service insertion enters the new server-normalized branch.
do $$ declare definition text; patched text; begin
  definition:=pg_get_functiondef('public.enforce_booking_contract()'::regprocedure);
  definition:=replace(definition,'(new.starts_at at time zone ''Africa/Dakar'')::date',
    '(new.starts_at at time zone booking_private.provider_timezone(selected.provider_id,selected.business_id))::date');
  if position('prepare_multi_booking' in definition)>0 then raise exception 'Multi-service branch already present'; end if;
  patched:=regexp_replace(definition,'\mbegin\M',
    E'begin\n  if new.service_ids is not null or new.service_snapshot is not null then return booking_private.prepare_multi_booking(new); end if;', 'i');
  if patched=definition then raise exception 'Booking contract implementation changed'; end if;
  execute patched;
  definition:=pg_get_functiondef('public.enforce_salon_booking_contract()'::regprocedure);
  patched:=replace(definition,'booking_private.can_assign(new.provider_service_id,c.id,new.starts_at,new.ends_at)',
    'booking_private.can_assign_services(new.service_ids,new.provider_service_id,c.id,new.starts_at,new.ends_at)');
  if patched=definition then raise exception 'Salon assignment implementation changed'; end if;
  execute patched;
end $$;

create function booking_private.guard_multi_service_booking()
returns trigger language plpgsql security definer set search_path='' as $$
declare enabled boolean; occupied integer; zone text; ignored uuid;
begin
  if tg_op='UPDATE' then
    if new.service_ids is distinct from old.service_ids or new.service_snapshot is distinct from old.service_snapshot
      or (old.service_ids is not null and (new.selected_option_ids is distinct from old.selected_option_ids
        or new.base_amount is distinct from old.base_amount or new.options_amount is distinct from old.options_amount
        or new.discount_amount is distinct from old.discount_amount or new.deposit_amount is distinct from old.deposit_amount)) then
      raise exception 'Prestations contractuelles immuables' using errcode='42501';
    end if;
    if old.service_ids is null then return new; end if;
    if new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at
      and new.collaborator_id is not distinct from old.collaborator_id then return new; end if;
    if new.ends_at-new.starts_at<>old.ends_at-old.starts_at then raise exception 'Durée contractuelle immuable' using errcode='42501'; end if;
    ignored:=old.id;
  elsif new.service_ids is null then return new;
  end if;
  if exists(select 1 from unnest(new.service_ids) sid where not exists(
    select 1 from public.provider_services service where service.id=sid
      and service.provider_id=new.provider_id and service.business_id is not distinct from new.business_id
      and service.status='published' and service.is_active and service.archived_at is null)) then
    raise exception 'Une prestation contractuelle n’est plus réservable' using errcode='23514';
  end if;
  -- Authorizations and status transitions remain enforced by the existing
  -- update guard. This trigger only adds every-service resource validation.
  select coalesce(b.team_booking_enabled,false) into enabled from public.businesses b where b.id=new.business_id;
  if coalesce(enabled,false) then
    if not booking_private.can_assign_services(new.service_ids,new.provider_service_id,new.collaborator_id,new.starts_at,new.ends_at,ignored) then
      raise exception 'Une prestation n’est pas réalisable par cette personne sur le bloc complet' using errcode='23P01';
    end if;
  else
    zone:=booking_private.provider_timezone(new.provider_id,new.business_id);
    occupied:=ceil(extract(epoch from(coalesce(new.resource_busy_until,new.ends_at)-new.starts_at))/60)::integer;
    if not exists(select 1 from booking_private.multi_service_slots(new.provider_id,new.provider_service_id,
      (new.starts_at at time zone zone)::date,occupied,ignored) s where s.slot_start=new.starts_at) then
      raise exception 'Bloc de prestations indisponible' using errcode='23P01';
    end if;
  end if;
  return new;
end $$;
revoke all on function booking_private.guard_multi_service_booking() from public,anon,authenticated;
create trigger bookings_zz_multi_service_guard before insert or update on public.bookings
for each row execute function booking_private.guard_multi_service_booking();

create function public.get_multi_service_availability(target_service_ids uuid[],from_date date default current_date,days integer default 1,target_option_ids uuid[] default '{}'::uuid[],target_collaborator_id uuid default null,target_location_mode text default 'salon')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q jsonb; enabled boolean; provider uuid; business uuid; people jsonb:='[]'::jsonb; slots jsonb:='[]'::jsonb;
begin
  if from_date is null or from_date<current_date-1 or from_date>current_date+366 or days is null or days not between 1 and 14 then raise exception 'Période invalide' using errcode='22023'; end if;
  q:=booking_private.multi_service_quote(target_service_ids,target_option_ids,target_location_mode);
  provider:=(q->>'providerId')::uuid; business:=(q->>'businessId')::uuid;
  select coalesce(b.team_booking_enabled,false) into enabled from public.businesses b where b.id=business;
  if coalesce(enabled,false) then
    select coalesce(jsonb_agg(jsonb_build_object('collaborator_id',c.id,'display_name',c.display_name,
      'title',c.title,'avatar_url',c.avatar_url,'specialties',c.specialties) order by c.display_name,c.id),'[]'::jsonb) into people
    from public.collaborators c where c.business_id=business and c.is_active and c.is_bookable and c.archived_at is null
      and not exists(select 1 from unnest(target_service_ids) sid where not exists(
        select 1 from public.collaborator_services skill where skill.collaborator_id=c.id and skill.provider_service_id=sid));
    if target_collaborator_id is not null then
      -- A named person is generated before every team-wide display cap. This
      -- avoids hiding her later free day behind thousands of other slots.
      select coalesce(jsonb_agg(to_jsonb(x) order by x.slot_start),'[]'::jsonb) into slots from (
        select candidate.start_at as slot_start,c.id as collaborator_id,c.display_name,c.title,c.avatar_url,c.specialties
        from public.collaborators c cross join generate_series(0,days-1) d
        cross join lateral booking_private.employee_windows(c.id,from_date+d) w
        cross join lateral generate_series(w.window_start,
          w.window_end-make_interval(mins=>(q->>'durationMinutes')::integer),
          make_interval(mins=>w.interval_minutes)) candidate(start_at)
        where c.id=target_collaborator_id and c.business_id=business
          and candidate.start_at>=now()+make_interval(mins=>booking_private.minimum_booking_notice())
          and booking_private.can_assign_services(target_service_ids,target_service_ids[1],c.id,
            candidate.start_at,candidate.start_at+make_interval(mins=>(q->>'durationMinutes')::integer))
        order by candidate.start_at limit 1000
      ) x;
    else
    select coalesce(jsonb_agg(to_jsonb(x) order by x.slot_start,x.collaborator_id),'[]'::jsonb) into slots from (
      select t.* from public.get_team_available_slots(target_service_ids[1],from_date,days) t
      where booking_private.can_assign_services(target_service_ids,target_service_ids[1],t.collaborator_id,
        t.slot_start,t.slot_start+make_interval(mins=>(q->>'durationMinutes')::integer)) limit 1000
    ) x;
    end if;
  else
    if target_collaborator_id is not null then raise exception 'Réservation par collaborateur indisponible' using errcode='22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('slot_start',x.slot_start) order by x.slot_start),'[]'::jsonb) into slots from (
      select distinct s.slot_start from generate_series(0,days-1) d
      cross join lateral booking_private.multi_service_slots(provider,target_service_ids[1],from_date+d,
        (q->>'durationMinutes')::integer,null) s order by s.slot_start limit 1000
    ) x;
  end if;
  return q||jsonb_build_object('distanceTravelPending',target_location_mode='client_address','teamEnabled',coalesce(enabled,false),'people',people,'slots',slots);
end $$;
revoke all on function public.get_multi_service_availability(uuid[],date,integer,uuid[],uuid,text) from public,anon,authenticated;
grant execute on function public.get_multi_service_availability(uuid[],date,integer,uuid[],uuid,text) to anon,authenticated;

create function public.create_multi_service_booking(target_service_ids uuid[],target_starts_at timestamptz,
  target_collaborator_id uuid default null,target_location_mode text default 'salon',target_address text default null,
  target_note text default null,target_source_post_id uuid default null,target_option_ids uuid[] default '{}'::uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode='42501'; end if;
  if target_location_mode<>'salon' or target_address is not null then
    raise exception 'Le panier multiple est disponible en salon' using errcode='22023';
  end if;
  if target_note is not null and length(target_note)>1000 then raise exception 'Note trop longue' using errcode='22023'; end if;
  insert into public.bookings(client_id,provider_id,provider_service_id,service_ids,starts_at,ends_at,status,
    location_mode,collaborator_id,total_amount,currency,client_note,source_post_id,selected_option_ids)
  select auth.uid(),service.provider_id,service.id,target_service_ids,target_starts_at,target_starts_at+interval '1 minute','pending',
    'salon',target_collaborator_id,0,service.currency,nullif(trim(target_note),''),target_source_post_id,target_option_ids
  from public.provider_services service where service.id=target_service_ids[1]
  returning * into b;
  if b.id is null then raise exception 'Prestation principale introuvable' using errcode='23514'; end if;
  return jsonb_build_object('id',b.id,'starts_at',b.starts_at,'ends_at',b.ends_at,'total_amount',b.total_amount,
    'currency',trim(b.currency::text),'collaborator_name',b.collaborator_name,
    'collaborator_avatar_url',b.collaborator_avatar_url,'services',b.service_snapshot);
end $$;
revoke all on function public.create_multi_service_booking(uuid[],timestamptz,uuid,text,text,text,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.create_multi_service_booking(uuid[],timestamptz,uuid,text,text,text,uuid,uuid[]) to authenticated;

-- The client reschedule migration precedes this one. Its candidate list must
-- also require the same person to be qualified for every contracted service.
do $$ declare definition text; patched text; begin
  if to_regprocedure('booking_private.client_reschedule_slots(uuid,date)') is not null then
    definition:=pg_get_functiondef('booking_private.client_reschedule_slots(uuid,date)'::regprocedure);
    patched:=replace(definition,'booking_private.can_assign(b.provider_service_id,b.collaborator_id,',
      'booking_private.can_assign_services(b.service_ids,b.provider_service_id,b.collaborator_id,');
    if patched<>definition then execute patched; end if;
  end if;
end $$;
-- Existing assignment, conflict and owner-report APIs must use the same
-- complete qualification contract as insertion. Preserve all their ACLs and
-- authorization checks; abort on an unexpected source definition.
do $$ declare item record; definition text; patched text; begin
  for item in select * from (values
    ('public.get_reassignment_candidates(uuid)','booking_private.can_assign(booking.provider_service_id,c.id,','booking_private.can_assign_services(booking.service_ids,booking.provider_service_id,c.id,'),
    ('public.reassign_booking_collaborator(uuid,uuid,text)','booking_private.can_assign(booking.provider_service_id,c.id,','booking_private.can_assign_services(booking.service_ids,booking.provider_service_id,c.id,'),
    ('public.protect_salon_booking_contract()','booking_private.can_assign(old.provider_service_id,c.id,','booking_private.can_assign_services(old.service_ids,old.provider_service_id,c.id,'),
    ('booking_private.owner_booking_slot_available(uuid,timestamptz,timestamptz)','booking_private.can_assign(b.provider_service_id,b.collaborator_id,','booking_private.can_assign_services(b.service_ids,b.provider_service_id,b.collaborator_id,'),
    ('public.get_my_collaborator_calendar()','booking_private.can_assign(k.provider_service_id,c.id,','booking_private.can_assign_services(k.service_ids,k.provider_service_id,c.id,'),
    ('public.get_team_agenda(uuid,date,integer)','booking_private.can_assign(b.provider_service_id,b.collaborator_id,','booking_private.can_assign_services(b.service_ids,b.provider_service_id,b.collaborator_id,'),
    ('booking_private.calendar_changed()','booking_private.can_assign(b.provider_service_id,employee,','booking_private.can_assign_services(b.service_ids,b.provider_service_id,employee,')
  ) specs(signature,old_call,new_call) loop
    if to_regprocedure(item.signature) is null then continue; end if;
    definition:=pg_get_functiondef(to_regprocedure(item.signature));
    patched:=replace(definition,item.old_call,item.new_call);
    if patched=definition then raise exception 'Multi-service caller changed: %',item.signature; end if;
    execute patched;
  end loop;
end $$;
create function booking_private.service_snapshot_title(snapshot jsonb,fallback_title text)
returns text language sql immutable security invoker set search_path='' as $$
  select coalesce((select string_agg(item->>'title',' + ' order by position)
    from jsonb_array_elements(snapshot) with ordinality entries(item,position)),fallback_title)
$$;
revoke all on function booking_private.service_snapshot_title(jsonb,text) from public,anon,authenticated;
do $$ declare definition text; patched text; begin
  if to_regprocedure('public.get_team_agenda(uuid,date,integer)') is not null then
    definition:=pg_get_functiondef('public.get_team_agenda(uuid,date,integer)'::regprocedure);
    patched:=replace(definition,'s.title as service_title','booking_private.service_snapshot_title(b.service_snapshot,s.title) as service_title');
    if patched=definition then raise exception 'Team agenda service title changed'; end if;
    execute patched;
  end if;
end $$;

-- Reject every online payment entry point, including direct RPC calls. The
-- aggregate on-site contract is not silently charged through its first item.
create function booking_private.multi_service_on_site_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.payment_method::text is distinct from 'on_site' and exists(
    select 1 from public.bookings b where b.id=new.booking_id and b.service_ids is not null
  ) then raise exception 'Paiement sur place requis pour ce panier' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function booking_private.multi_service_on_site_payment() from public,anon,authenticated;
create trigger payments_ab_multi_service_on_site before insert or update of booking_id,payment_method on public.payments
for each row execute function booking_private.multi_service_on_site_payment();
notify pgrst,'reload schema';
commit;
