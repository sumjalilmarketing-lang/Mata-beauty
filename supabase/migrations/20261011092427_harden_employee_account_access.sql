begin;

-- A valid, unexpired JWT must not preserve private team access after suspension.
-- Restrictive policies also cover any additional permissive owner policies.
create policy "active account required for employee hours"
on public.collaborator_hours as restrictive for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active'))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active'));
create policy "active account required for employee absences"
on public.collaborator_exceptions as restrictive for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active'))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active'));
create policy "active account required for assignment history"
on public.booking_assignments as restrictive for select to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active'));

-- The UI can update these tables directly, so checking the owner RPC alone is insufficient.
create trigger collaborators_active_editor before insert or update or delete on public.collaborators
for each row execute function booking_private.require_active_editor();
create trigger businesses_team_active_editor before update of team_booking_enabled on public.businesses
for each row execute function booking_private.require_active_editor();

create or replace function public.get_reassignment_candidates(target_booking_id uuid)
returns table(id uuid,display_name text,avatar_url text)
language plpgsql stable security definer set search_path='' as $$
declare booking public.bookings%rowtype;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status='active') then
    raise exception 'Compte actif requis' using errcode='42501';
  end if;
  select * into booking from public.bookings b where b.id=target_booking_id and b.provider_id=auth.uid();
  if booking.id is null then raise exception 'Accès refusé' using errcode='42501'; end if;
  return query select c.id,c.display_name,c.avatar_url from public.collaborators c
    where c.business_id=booking.business_id and booking_private.can_assign(booking.provider_service_id,c.id,booking.starts_at,booking.ends_at,booking.id) order by c.display_name;
end $$;

create or replace function public.get_team_agenda(target_business_id uuid,from_date date default current_date,days integer default 31)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.businesses b join public.profiles p on p.id=b.owner_id
    where b.id=target_business_id and b.owner_id=auth.uid() and not p.is_suspended and p.account_status='active') then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(item)) from (
    select b.id,b.starts_at,b.ends_at,b.status,b.collaborator_id,b.collaborator_name,b.provider_service_id,s.title as service_title,
      coalesce(nullif(p.display_name,''),nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),''),'Client') as client_name,
      case when b.collaborator_id is not null and b.starts_at>now() and b.status in ('pending','confirmed') then not booking_private.can_assign(b.provider_service_id,b.collaborator_id,b.starts_at,b.ends_at,b.id) else false end as assignment_conflict
    from public.bookings b join public.provider_services s on s.id=b.provider_service_id join public.profiles p on p.id=b.client_id
    where b.business_id=target_business_id and b.starts_at>=(from_date::timestamp at time zone 'Africa/Dakar')
      and b.starts_at<((from_date+greatest(1,least(days,93)))::timestamp at time zone 'Africa/Dakar') order by b.starts_at,b.id limit 500
  ) item),'[]'::jsonb);
end $$;

revoke all on function public.get_team_agenda(uuid,date,integer),public.get_reassignment_candidates(uuid) from public,anon;
grant execute on function public.get_team_agenda(uuid,date,integer),public.get_reassignment_candidates(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
