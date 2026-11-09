-- Exact existing server quote function captured read-only for isolated regression tests.
CREATE OR REPLACE FUNCTION public.calculate_service_quote(target_provider_service_id uuid, target_option_ids uuid[] DEFAULT '{}'::uuid[], target_promotion_id uuid DEFAULT NULL::uuid, target_location_mode text DEFAULT 'salon'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare selected public.provider_services%rowtype; normalized_options uuid[]; option_total integer:=0; option_duration integer:=0; discount_total integer:=0; base_total integer; selected_promotion public.promotions%rowtype; final_total integer;
begin
  select * into selected from public.provider_services where id=target_provider_service_id and status='published' and is_active and archived_at is null;
  if not found then raise exception 'Prestation indisponible'; end if;
  if target_location_mode not in ('salon','client_address') or not target_location_mode=any(selected.location_modes) then raise exception 'Lieu indisponible'; end if;
  if exists(select 1 from unnest(coalesce(target_option_ids,'{}'::uuid[])) x(id) left join public.service_options o on o.id=x.id and o.provider_service_id=selected.id and o.is_active where o.id is null) then raise exception 'Option invalide'; end if;
  select coalesce(array_agg(distinct option_id),'{}'::uuid[]) into normalized_options from (
    select unnest(coalesce(target_option_ids,'{}'::uuid[])) option_id
    union select id from public.service_options where provider_service_id=selected.id and is_active and is_required
  ) choices;
  select coalesce(sum(price_amount),0),coalesce(sum(duration_minutes),0) into option_total,option_duration from public.service_options where id=any(normalized_options) and provider_service_id=selected.id and is_active;
  base_total:=case when target_location_mode='client_address' then coalesce(selected.home_price_amount,selected.price_amount)+selected.travel_fee_amount else selected.price_amount end;
  if target_promotion_id is not null then
    select * into selected_promotion from public.promotions where id=target_promotion_id and provider_id=selected.provider_id and (provider_service_id is null or provider_service_id=selected.id) and status='published' and is_active and starts_at<=now() and ends_at>now() and (max_uses is null or used_count<max_uses);
    if found and selected_promotion.new_clients_only and exists(select 1 from public.bookings b where b.client_id=auth.uid() and b.provider_id=selected.provider_id and b.status='completed') then selected_promotion.id:=null; end if;
    if selected_promotion.id is not null and selected_promotion.audience='followers' and not exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_provider_id=selected.provider_id) then selected_promotion.id:=null; end if;
    if selected_promotion.id is not null then discount_total:=case when selected_promotion.promotional_price_amount is not null then greatest(0,base_total+option_total-selected_promotion.promotional_price_amount) when selected_promotion.discount_type='percentage' then floor((base_total+option_total)*selected_promotion.discount_value/100.0)::integer else least(base_total+option_total,selected_promotion.discount_value) end; end if;
  end if;
  final_total:=greatest(0,base_total+option_total-discount_total);
  return jsonb_build_object('base_amount',base_total,'options_amount',option_total,'discount_amount',discount_total,'total_amount',final_total,'deposit_amount',least(selected.deposit_amount,final_total),'currency',selected.currency,'duration_minutes',selected.duration_minutes+option_duration,'selected_option_ids',normalized_options);
end; $function$
;

-- Existing mono-service production contract; the migration preserves this path.
CREATE OR REPLACE FUNCTION public.enforce_booking_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected public.provider_services%rowtype; quote jsonb; quote_duration integer;
  provider_location public.provider_profiles%rowtype; business_location public.businesses%rowtype;
  origin_lat double precision; origin_lng double precision; max_radius numeric; free_radius numeric; fee_per_km integer;
  computed_distance double precision; computed_fee integer:=0;
begin
  if new.conversation_quote_id is not null then return quote_private.prepare_booking(new); end if;
  if auth.uid() is null and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Authentification requise'; end if;
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and not public.is_admin() and new.client_id is distinct from auth.uid() then raise exception 'Reservation interdite pour un autre client'; end if;
  select * into selected from public.provider_services where id=new.provider_service_id and status='published' and is_active and archived_at is null for share;
  if not found then raise exception 'Prestation indisponible'; end if;
  if new.starts_at<=now() or new.starts_at>now()+interval '1 year' then raise exception 'Date de reservation invalide'; end if;
  if not exists(select 1 from public.get_available_slots(selected.provider_id,selected.id,(new.starts_at at time zone 'Africa/Dakar')::date,1) slot where slot.slot_start=new.starts_at) then raise exception 'Créneau indisponible' using errcode='23P01'; end if;
  quote:=public.calculate_service_quote(new.provider_service_id,new.selected_option_ids,new.promotion_id,new.location_mode); quote_duration:=(quote->>'duration_minutes')::integer;
  new.provider_id:=selected.provider_id; new.business_id:=selected.business_id; new.ends_at:=new.starts_at+make_interval(mins=>quote_duration);
  new.selected_option_ids:=array(select jsonb_array_elements_text(quote->'selected_option_ids')::uuid);
  new.base_amount:=(quote->>'base_amount')::integer; new.options_amount:=(quote->>'options_amount')::integer; new.discount_amount:=(quote->>'discount_amount')::integer; new.deposit_amount:=(quote->>'deposit_amount')::integer; new.total_amount:=(quote->>'total_amount')::integer; new.currency:=quote->>'currency'; new.status:='pending';
  select * into provider_location from public.provider_profiles where profile_id=selected.provider_id;
  if selected.business_id is not null then select * into business_location from public.businesses where id=selected.business_id; end if;
  origin_lat:=coalesce(business_location.latitude::double precision,provider_location.latitude);
  origin_lng:=coalesce(business_location.longitude::double precision,provider_location.longitude);
  if new.location_mode='client_address' then
    if nullif(trim(new.appointment_address),'') is null or new.appointment_latitude is null or new.appointment_longitude is null then raise exception 'Adresse géolocalisée requise'; end if;
    if new.appointment_latitude not between -90 and 90 or new.appointment_longitude not between -180 and 180 then raise exception 'Coordonnées client invalides'; end if;
    if origin_lat is null or origin_lng is null then raise exception 'Localisation professionnelle indisponible'; end if;
    max_radius:=coalesce(selected.home_service_radius_km,business_location.service_radius_km,provider_location.travel_radius_km,0);
    if max_radius<=0 then raise exception 'Prestation à domicile indisponible'; end if;
    computed_distance:=public.distance_km(origin_lat,origin_lng,new.appointment_latitude,new.appointment_longitude);
    if computed_distance>max_radius then raise exception 'Adresse hors rayon de déplacement'; end if;
    free_radius:=coalesce(selected.free_travel_radius_km,business_location.free_travel_radius_km,provider_location.free_travel_radius_km,0);
    fee_per_km:=coalesce(selected.travel_fee_per_km_amount,business_location.travel_fee_per_km_amount,provider_location.travel_fee_per_km_amount,0);
    computed_fee:=(ceil(greatest(0,computed_distance-free_radius))*fee_per_km)::integer;
    new.travel_distance_km:=round(computed_distance::numeric,2); new.distance_travel_fee_amount:=computed_fee; new.total_amount:=new.total_amount+computed_fee;
  else
    new.appointment_address:=coalesce(business_location.address,provider_location.base_address);
    new.appointment_latitude:=origin_lat; new.appointment_longitude:=origin_lng; new.appointment_place_id:=coalesce(business_location.location_place_id,provider_location.location_place_id);
    new.travel_distance_km:=null; new.distance_travel_fee_amount:=0;
  end if;
  return new;
end; $function$
;
