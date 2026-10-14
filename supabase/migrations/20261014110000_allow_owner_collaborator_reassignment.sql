-- A provider may reassign a salon booking without changing its status.
-- The prior trigger checked the status transition first, making its existing
-- same-status reassignment exception unreachable for pending bookings.
create or replace function public.validate_booking_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  transition_allowed boolean := false;
  staff_actor boolean := false;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_admin() then
    return new;
  end if;

  if new.client_id is distinct from old.client_id
    or new.provider_id is distinct from old.provider_id
    or new.provider_service_id is distinct from old.provider_service_id
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.location_mode is distinct from old.location_mode
    or new.appointment_address is distinct from old.appointment_address
    or new.total_amount is distinct from old.total_amount
    or new.currency is distinct from old.currency
    or new.client_note is distinct from old.client_note then
    raise exception 'Les données contractuelles de la réservation sont immuables';
  end if;

  -- This path is still constrained by RLS and the salon contract trigger,
  -- which validates the new collaborator, service, schedule and conflicts.
  if auth.uid() = old.provider_id
    and new.status = old.status
    and new.collaborator_id is distinct from old.collaborator_id then
    return new;
  end if;

  staff_actor := current_setting('app.staff_booking_action', true) = 'true'
    and exists (
      select 1
      from booking_private.collaborator_access access
      join public.collaborators collaborator on collaborator.id = access.collaborator_id
      where collaborator.id = old.collaborator_id
        and access.profile_id = auth.uid()
        and collaborator.is_active
        and collaborator.archived_at is null
        and 'bookings.manage' = any(access.staff_permissions)
    );

  transition_allowed := case old.status
    when 'pending' then new.status in ('confirmed', 'declined', 'cancelled_by_client', 'cancelled_by_provider')
    when 'confirmed' then new.status in ('cancelled_by_client', 'cancelled_by_provider', 'in_progress', 'no_show', 'disputed')
    when 'in_progress' then new.status in ('completed', 'disputed')
    when 'completed' then new.status = 'disputed'
    when 'no_show' then new.status = 'disputed'
    else false
  end;

  if not transition_allowed then
    raise exception 'Transition de réservation interdite : % vers %', old.status, new.status;
  end if;

  if staff_actor then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'declined'))
      or (old.status = 'confirmed' and new.status in ('in_progress', 'no_show'))
      or (old.status = 'in_progress' and new.status = 'completed')
    ) then
      raise exception 'Transition de rendez-vous non autorisée au collaborateur' using errcode = '42501';
    end if;
    return new;
  end if;

  if auth.uid() = old.client_id and new.status not in ('cancelled_by_client', 'disputed') then
    raise exception 'Transition non autorisée pour le client';
  end if;

  if auth.uid() = old.provider_id and new.status not in (
    'confirmed', 'declined', 'cancelled_by_provider', 'in_progress', 'completed', 'no_show', 'disputed'
  ) then
    raise exception 'Transition non autorisée pour le prestataire';
  end if;

  if auth.uid() not in (old.client_id, old.provider_id) then
    raise exception 'Modification de réservation interdite';
  end if;

  return new;
end;
$function$;
