begin;
-- Auth represents missing email addresses as an empty string for phone users.
-- Only verified Auth identities activate an account; client metadata grants no role.
do $migration$ declare definition text; target text;begin
 foreach target in array array['public.handle_new_user()','public.ensure_authenticated_profile()'] loop
  select pg_get_functiondef(target::regprocedure) into definition;
  if target='public.handle_new_user()' then
   if position('when new.email is not null and new.email_confirmed_at is null' in definition)=0 then raise exception 'Unexpected Auth trigger definition';end if;
   definition:=replace(definition,'when new.email is not null and new.email_confirmed_at is null','when nullif(trim(new.email),'''') is not null and new.email_confirmed_at is null');
   definition:=replace(definition,'when new.phone is not null and new.phone_confirmed_at is null','when nullif(trim(new.phone),'''') is not null and new.phone_confirmed_at is null');
  else
   if position('when identity.email is not null and identity.email_confirmed_at is null' in definition)=0 then raise exception 'Unexpected profile repair definition';end if;
   definition:=replace(definition,'when identity.email is not null and identity.email_confirmed_at is null','when nullif(trim(identity.email),'''') is not null and identity.email_confirmed_at is null');
   definition:=replace(definition,'when identity.phone is not null and identity.phone_confirmed_at is null','when nullif(trim(identity.phone),'''') is not null and identity.phone_confirmed_at is null');
   definition:=replace(definition,'nullif(trim(identity.raw_user_meta_data->>''full_name''), ''''),','nullif(trim(identity.raw_user_meta_data->>''display_name''), ''''), nullif(trim(identity.raw_user_meta_data->>''full_name''), ''''),');
  end if;
  execute definition;
 end loop;
end $migration$;
notify pgrst,'reload schema';
commit;
