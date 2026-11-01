begin;

-- Catalogue administrable, avec hiérarchie et image, sans accès d'écriture direct
-- depuis le navigateur.
alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete restrict;
alter table public.categories add column if not exists image_url text;
create index if not exists categories_parent_order_idx on public.categories(parent_id, sort_order, name);

create or replace function public.admin_manage_category(
  target_action text,
  target_category_id uuid default null,
  target_name text default null,
  target_slug text default null,
  target_description text default null,
  target_icon text default null,
  target_image_url text default null,
  target_parent_id uuid default null,
  target_sort_order integer default 0,
  target_is_active boolean default true
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_row public.categories%rowtype; result_id uuid; dependency_count bigint;
begin
  if not public.has_admin_permission('categories.manage') then raise exception 'Permission insuffisante'; end if;
  if target_action not in ('create','update','set_active','delete') then raise exception 'Action invalide'; end if;

  if target_action='create' then
    if char_length(trim(coalesce(target_name,''))) not between 2 and 80
      or coalesce(target_slug,'') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or target_sort_order not between 0 and 10000 then raise exception 'Catégorie invalide'; end if;
    if target_parent_id is not null and not exists(select 1 from public.categories where id=target_parent_id) then raise exception 'Catégorie parente introuvable'; end if;
    insert into public.categories(name,slug,description,icon,image_url,parent_id,sort_order,is_active)
    values(trim(target_name),target_slug,nullif(trim(target_description),''),nullif(trim(target_icon),''),nullif(trim(target_image_url),''),target_parent_id,target_sort_order,target_is_active)
    returning id into result_id;
  else
    select * into current_row from public.categories where id=target_category_id for update;
    if not found then raise exception 'Catégorie introuvable'; end if;
    result_id:=current_row.id;
    if target_action='update' then
      if char_length(trim(coalesce(target_name,''))) not between 2 and 80
        or coalesce(target_slug,'') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        or target_sort_order not between 0 and 10000
        or target_parent_id=target_category_id then raise exception 'Catégorie invalide'; end if;
      update public.categories set name=trim(target_name),slug=target_slug,description=nullif(trim(target_description),''),
        icon=nullif(trim(target_icon),''),image_url=nullif(trim(target_image_url),''),parent_id=target_parent_id,
        sort_order=target_sort_order,is_active=target_is_active,updated_at=now() where id=target_category_id;
    elsif target_action='set_active' then
      update public.categories set is_active=target_is_active,updated_at=now() where id=target_category_id;
    else
      select (select count(*) from public.services where category_id=target_category_id)
        +(select count(*) from public.provider_categories where category_id=target_category_id)
        +(select count(*) from public.categories where parent_id=target_category_id) into dependency_count;
      if dependency_count>0 then raise exception 'Suppression impossible : cette catégorie possède des dépendances'; end if;
      delete from public.categories where id=target_category_id;
    end if;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'category.'||target_action,'category',result_id,
    case when target_action='create' then null else to_jsonb(current_row) end,
    case when target_action='delete' then null else (select to_jsonb(c) from public.categories c where c.id=result_id) end);
  return result_id;
end; $$;
revoke all on function public.admin_manage_category(text,uuid,text,text,text,text,text,uuid,integer,boolean) from public,anon;
grant execute on function public.admin_manage_category(text,uuid,text,text,text,text,text,uuid,integer,boolean) to authenticated;

-- Une tâche planifiée appelle cette fonction serveur. Le feed n'expose jamais les
-- brouillons et une publication ne part que si ses invariants restent valides.
create or replace function public.publish_due_social_posts()
returns integer language plpgsql security definer set search_path='' as $$
declare published_count integer;
begin
  with due as (
    select p.id from public.posts p
    join public.provider_profiles provider on provider.profile_id=p.author_id and provider.status='approved'
    where p.status='scheduled' and p.scheduled_for<=now() and p.client_consent_confirmed
      and exists(select 1 from public.post_services ps where ps.post_id=p.id and ps.is_primary)
    for update of p skip locked
  ), changed as (
    update public.posts p set status='published',published_at=now(),updated_at=now()
    from due where p.id=due.id returning p.id
  ) select count(*) into published_count from changed;
  return published_count;
end; $$;
revoke all on function public.publish_due_social_posts() from public,anon,authenticated;
grant execute on function public.publish_due_social_posts() to service_role;

-- Source unique du calcul brut / commission / net, appliquée à tous les providers,
-- y compris le provider mock.
create or replace function public.resolve_commission_breakdown(target_booking_id uuid,target_gross integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_provider uuid; target_category uuid; selected_rate numeric(5,2):=10; fee integer;
begin
  if target_gross<0 then raise exception 'Montant invalide'; end if;
  select b.provider_id,s.category_id into target_provider,target_category from public.bookings b
    left join public.provider_services ps on ps.id=b.provider_service_id
    left join public.services s on s.id=ps.service_id where b.id=target_booking_id;
  if target_provider is null then raise exception 'Réservation introuvable'; end if;
  select cr.rate into selected_rate from public.commission_rules cr
    where cr.is_active and cr.valid_from<=now() and (cr.valid_until is null or cr.valid_until>now())
      and (cr.provider_id=target_provider or (cr.provider_id is null and cr.category_id=target_category) or (cr.provider_id is null and cr.category_id is null))
    order by (cr.provider_id is not null) desc,(cr.category_id is not null) desc,cr.valid_from desc limit 1;
  selected_rate:=coalesce(selected_rate,10); fee:=round(target_gross*selected_rate/100);
  return jsonb_build_object('gross_amount',target_gross,'commission_rate',selected_rate,'platform_fee',fee,'professional_net_amount',target_gross-fee,'currency','XOF');
end; $$;
revoke all on function public.resolve_commission_breakdown(uuid,integer) from public,anon;
grant execute on function public.resolve_commission_breakdown(uuid,integer) to authenticated,service_role;

create or replace function public.apply_payment_commission()
returns trigger language plpgsql security definer set search_path='' as $$
declare breakdown jsonb;
begin
  breakdown:=public.resolve_commission_breakdown(new.booking_id,coalesce(new.gross_amount,new.amount));
  new.gross_amount:=(breakdown->>'gross_amount')::integer;
  new.platform_fee:=(breakdown->>'platform_fee')::integer;
  new.professional_net_amount:=(breakdown->>'professional_net_amount')::integer-new.provider_fee;
  return new;
end; $$;
drop trigger if exists payments_apply_commission on public.payments;
create trigger payments_apply_commission before insert on public.payments for each row execute function public.apply_payment_commission();

create or replace function public.record_platform_commission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.payment_status::text in ('paid','held','available','payout_pending','paid_out')
    and (tg_op='INSERT' or old.payment_status is distinct from new.payment_status) then
    insert into public.platform_commissions(payment_id,rate,amount,currency)
    values(new.id,case when new.gross_amount=0 then 0 else round(new.platform_fee::numeric*100/new.gross_amount,2) end,new.platform_fee,new.currency)
    on conflict(payment_id) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists payments_record_platform_commission on public.payments;
create trigger payments_record_platform_commission after insert or update of payment_status on public.payments
for each row execute function public.record_platform_commission();

commit;
