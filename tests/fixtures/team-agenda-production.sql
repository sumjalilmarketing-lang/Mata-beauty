CREATE OR REPLACE FUNCTION public.get_team_agenda(target_business_id uuid, from_date date DEFAULT CURRENT_DATE, days integer DEFAULT 31)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare zone text;
begin
  select booking_private.provider_timezone(b.owner_id,b.id) into zone
    from public.businesses b join public.profiles owner on owner.id=b.owner_id
    where b.id=target_business_id and b.owner_id=auth.uid() and not owner.is_suspended and owner.account_status='active';
  if not found then raise exception 'Accès refusé' using errcode='42501'; end if;
  if zone is null then raise exception 'Le salon doit définir un fuseau IANA avant d’utiliser son agenda'; end if;
  return coalesce((select jsonb_agg(to_jsonb(item) order by item.starts_at,item.id) from (
    select booking.id,booking.starts_at,booking.ends_at,booking.status,booking.collaborator_id,booking.collaborator_name,booking.provider_service_id,service.title as service_title,
      coalesce(nullif(account.display_name,''),nullif(trim(coalesce(account.first_name,'')||' '||coalesce(account.last_name,'')),''),'Client') as client_name,
      case when booking.collaborator_id is not null and booking.starts_at>now() and booking.status in ('pending','confirmed') then not booking_private.can_assign(booking.provider_service_id,booking.collaborator_id,booking.starts_at,booking.ends_at,booking.id) else false end as assignment_conflict
    from public.bookings booking join public.provider_services service on service.id=booking.provider_service_id join public.profiles account on account.id=booking.client_id
    where booking.business_id=target_business_id
      and booking.starts_at >= (from_date::timestamp at time zone zone)
      and booking.starts_at < ((from_date+greatest(1,least(days,93)))::timestamp at time zone zone)
    order by booking.starts_at,booking.id limit 500
  ) item),'[]'::jsonb);
end $function$
