-- NULL auth.uid() previously made the ownership IF evaluate to NULL.
create or replace function public.set_owned_service_status(target_service_id uuid, next_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare selected public.provider_services%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode='42501'; end if;
  if next_status not in ('draft','published','paused','sold_out','archived','hidden') then raise exception 'Statut invalide'; end if;
  select * into selected from public.provider_services where id=target_service_id for update;
  if not found then raise exception 'Prestation introuvable'; end if;
  if selected.provider_id<>auth.uid() and not (selected.business_id is not null and public.has_business_commercial_permission(selected.business_id,case when next_status='archived' then 'service.archive' else 'service.publish' end)) then raise exception 'Permission insuffisante'; end if;
  if next_status='published' and not exists(select 1 from public.provider_profiles pp where pp.profile_id=selected.provider_id and pp.status='approved') then raise exception 'Profil professionnel non approuvé'; end if;
  update public.provider_services set status=next_status,updated_at=now() where id=target_service_id;
end; $$;
revoke all on function public.set_owned_service_status(uuid, text) from public, anon;
grant execute on function public.set_owned_service_status(uuid, text) to authenticated, service_role;
create or replace function public.update_owned_service_pricing(target_service_id uuid, target_price_amount integer, target_pricing_mode text, target_price_from_amount integer default null, target_home_price_amount integer default null, target_travel_fee_amount integer default 0, target_deposit_amount integer default 0)
returns void language plpgsql security definer set search_path = ''
as $$
declare selected public.provider_services%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode='42501'; end if;
  select * into selected from public.provider_services where id=target_service_id for update;
  if not found then raise exception 'Prestation introuvable'; end if;
  if selected.provider_id<>auth.uid() and not (selected.business_id is not null and public.has_business_commercial_permission(selected.business_id,'pricing.update')) then raise exception 'Permission pricing.update requise'; end if;
  if target_pricing_mode not in ('fixed','from','variable','option_based') or target_price_amount<0 or coalesce(target_price_from_amount,0)<0 or coalesce(target_home_price_amount,0)<0 or target_travel_fee_amount<0 or target_deposit_amount<0 then raise exception 'Tarification invalide'; end if;
  if target_deposit_amount>greatest(target_price_amount,coalesce(target_home_price_amount,target_price_amount)) then raise exception 'Acompte supérieur au prix'; end if;
  update public.provider_services set price_amount=target_price_amount,pricing_mode=target_pricing_mode,price_from_amount=target_price_from_amount,home_price_amount=target_home_price_amount,travel_fee_amount=target_travel_fee_amount,deposit_amount=target_deposit_amount,updated_at=now() where id=target_service_id;
end; $$;
revoke all on function public.update_owned_service_pricing(uuid, integer, text, integer, integer, integer, integer) from public, anon;
grant execute on function public.update_owned_service_pricing(uuid, integer, text, integer, integer, integer, integer) to authenticated, service_role;
