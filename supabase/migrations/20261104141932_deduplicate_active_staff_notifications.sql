begin;
-- Assignment and status triggers already emit a single employee notification.
-- Keep reminder fan-out, but never deliver new booking details to revoked staff.
do $migration$ declare definition text; old_filter text;begin
 select pg_get_functiondef('public.enqueue_web_push()'::regprocedure) into definition;
 old_filter:='where c.id=appointment.collaborator_id and c.is_active and c.archived_at is null';
 if position(old_filter in definition)=0 then raise exception 'Unexpected notification fan-out definition';end if;
 execute replace(definition,old_filter,old_filter||' and new.kind=''appointment_reminder'' and c.profile_id=booking_private.staff_booking_notification_recipient(c.id)');
end $migration$;
notify pgrst,'reload schema';commit;
