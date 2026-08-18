begin;

create or replace function public.update_owned_service_pricing(
  target_service_id uuid,
  target_price_amount integer,
  target_pricing_mode text,
  target_price_from_amount integer default null,
  target_home_price_amount integer default null,
  target_travel_fee_amount integer default 0,
  target_deposit_amount integer default 0
)
returns void language plpgsql security definer set search_path='' as $$
declare selected public.provider_services%rowtype;
begin
  select * into selected from public.provider_services where id=target_service_id for update;
  if not found then raise exception 'Prestation introuvable'; end if;
  if selected.provider_id<>auth.uid() and not (selected.business_id is not null and public.has_business_commercial_permission(selected.business_id,'pricing.update')) then raise exception 'Permission pricing.update requise'; end if;
  if target_pricing_mode not in ('fixed','from','variable','option_based') or target_price_amount<0 or coalesce(target_price_from_amount,0)<0 or coalesce(target_home_price_amount,0)<0 or target_travel_fee_amount<0 or target_deposit_amount<0 then raise exception 'Tarification invalide'; end if;
  if target_deposit_amount>greatest(target_price_amount,coalesce(target_home_price_amount,target_price_amount)) then raise exception 'Acompte supérieur au prix'; end if;
  update public.provider_services set price_amount=target_price_amount,pricing_mode=target_pricing_mode,price_from_amount=target_price_from_amount,home_price_amount=target_home_price_amount,travel_fee_amount=target_travel_fee_amount,deposit_amount=target_deposit_amount,updated_at=now() where id=target_service_id;
end; $$;
revoke all on function public.update_owned_service_pricing(uuid,integer,text,integer,integer,integer,integer) from public;
grant execute on function public.update_owned_service_pricing(uuid,integer,text,integer,integer,integer,integer) to authenticated;

create or replace function public.calculate_service_quote(target_provider_service_id uuid, target_option_ids uuid[] default '{}'::uuid[], target_promotion_id uuid default null, target_location_mode text default 'salon')
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
end; $$;

create or replace function public.enforce_booking_contract()
returns trigger language plpgsql security definer set search_path='' as $$
declare selected public.provider_services%rowtype; quote jsonb; quote_duration integer;
begin
  if auth.uid() is null and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Authentification requise'; end if;
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and not public.is_admin() and new.client_id is distinct from auth.uid() then raise exception 'Reservation interdite pour un autre client'; end if;
  select * into selected from public.provider_services where id=new.provider_service_id and status='published' and is_active and archived_at is null for share;
  if not found then raise exception 'Prestation indisponible'; end if;
  if new.starts_at<=now() or new.starts_at>now()+interval '1 year' then raise exception 'Date de reservation invalide'; end if;
  if new.location_mode='client_address' and nullif(trim(new.appointment_address),'') is null then raise exception 'Adresse client requise'; end if;
  if not exists(select 1 from public.get_available_slots(selected.provider_id,selected.id,(new.starts_at at time zone 'Africa/Dakar')::date,1) slot where slot.slot_start=new.starts_at) then raise exception 'Créneau indisponible'; end if;
  quote:=public.calculate_service_quote(new.provider_service_id,new.selected_option_ids,new.promotion_id,new.location_mode); quote_duration:=(quote->>'duration_minutes')::integer;
  new.provider_id:=selected.provider_id; new.business_id:=selected.business_id; new.ends_at:=new.starts_at+make_interval(mins=>quote_duration);
  new.selected_option_ids:=array(select jsonb_array_elements_text(quote->'selected_option_ids')::uuid);
  new.base_amount:=(quote->>'base_amount')::integer; new.options_amount:=(quote->>'options_amount')::integer; new.discount_amount:=(quote->>'discount_amount')::integer; new.deposit_amount:=(quote->>'deposit_amount')::integer; new.total_amount:=(quote->>'total_amount')::integer; new.currency:=quote->>'currency'; new.status:='pending';
  return new;
end; $$;
revoke all on function public.enforce_booking_contract() from public,anon,authenticated;

create or replace function public.count_promotion_booking()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.promotion_id is not null then update public.promotions set used_count=used_count+1 where id=new.promotion_id and status='published' and is_active and (max_uses is null or used_count<max_uses); end if;
  return new;
end; $$;
revoke all on function public.count_promotion_booking() from public,anon,authenticated;
drop trigger if exists bookings_count_promotion on public.bookings;
create trigger bookings_count_promotion after insert on public.bookings for each row execute function public.count_promotion_booking();

commit;
