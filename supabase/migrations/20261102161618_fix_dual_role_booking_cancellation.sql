-- A provider using the client space can book a service they also own.
-- Apply the client's cancellation rule in that case, rather than contradictory
-- client AND provider rules. No grants, RLS policies or protected fields change.
do $migration$
declare
  definition text;
  original_guard constant text := 'if auth.uid()=old.provider_id and new.status not in';
  corrected_guard constant text := 'if auth.uid()=old.provider_id and auth.uid() is distinct from old.client_id and new.status not in';
begin
  definition := pg_get_functiondef('public.validate_booking_update()'::regprocedure);
  if strpos(definition, corrected_guard) > 0 then return; end if;
  if strpos(definition, original_guard) = 0
    or strpos(definition, 'if auth.uid()=old.client_id and new.status not in') = 0 then
    raise exception 'Unexpected booking guard definition; review before applying';
  end if;
  execute replace(definition, original_guard, corrected_guard);
end;
$migration$;
