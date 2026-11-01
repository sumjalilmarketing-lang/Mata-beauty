begin;

create or replace function public.protect_provider_review_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')='service_role'
    or coalesce(current_setting('mata.rating_refresh',true),'')='trusted'
    or public.is_admin() then return new; end if;
  if tg_op='INSERT' then
    if new.status<>'draft' or new.verified_at is not null then raise exception 'Un nouveau profil prestataire doit être créé en brouillon'; end if;
  elsif new.status is distinct from old.status
    or new.verified_at is distinct from old.verified_at
    or new.average_rating is distinct from old.average_rating
    or new.review_count is distinct from old.review_count then
    raise exception 'Les champs de validation et de notation sont administrés par le serveur';
  end if;
  return new;
end; $$;

create or replace function public.refresh_provider_rating()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_provider uuid:=coalesce(new.provider_id,old.provider_id);
begin
  perform set_config('mata.rating_refresh','trusted',true);
  update public.provider_profiles set
    average_rating=coalesce((select round(avg(rating)::numeric,1) from public.reviews where provider_id=target_provider and is_visible),0),
    review_count=(select count(*)::integer from public.reviews where provider_id=target_provider and is_visible)
  where profile_id=target_provider;
  perform set_config('mata.rating_refresh','',true);
  return coalesce(new,old);
end; $$;
revoke all on function public.refresh_provider_rating() from public,anon,authenticated;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating after insert or update or delete on public.reviews
for each row execute function public.refresh_provider_rating();

commit;
