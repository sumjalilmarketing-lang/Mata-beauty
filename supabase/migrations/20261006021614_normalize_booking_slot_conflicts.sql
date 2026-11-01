-- Match the exclusion-constraint conflict when availability already changed.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.enforce_booking_contract()'::regprocedure) into definition;
  if position('raise exception ''Créneau indisponible'';' in definition)>0 then
    execute replace(definition, 'raise exception ''Créneau indisponible'';', 'raise exception ''Créneau indisponible'' using errcode=''23P01'';');
  end if;
end;
$$;
