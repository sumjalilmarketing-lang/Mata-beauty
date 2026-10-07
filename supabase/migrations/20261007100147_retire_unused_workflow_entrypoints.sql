-- Older installations may not contain all three legacy entry points.
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.manage_provider_onboarding(uuid,text,text)',
    'public.complete_provider_onboarding_information(text)',
    'public.request_payment_refund(uuid,integer,text)'
  ] loop
    if to_regprocedure(signature) is not null then
      execute format('revoke execute on function %s from public,anon,authenticated',to_regprocedure(signature));
    end if;
  end loop;
end; $$;
