create function public.guard_feed_comment_rate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','')='service_role' then return new; end if;
  if auth.uid() is null or new.author_id is distinct from auth.uid()
    or not exists(select 1 from public.profiles where id=auth.uid() and not is_suspended and account_status='active') then
    raise exception 'Compte actif requis' using errcode='42501';
  end if;
  if not public.consume_financial_rate_limit('feed_comment_minute',md5(auth.uid()::text),5,60)
    or not public.consume_financial_rate_limit('feed_comment_ten_minutes',md5(auth.uid()::text),20,600) then
    raise exception 'Patientez avant de publier un nouveau commentaire' using errcode='P0001';
  end if;
  new.created_at:=now();
  return new;
end; $$;
revoke all on function public.guard_feed_comment_rate() from public,anon,authenticated;
create trigger feed_comment_rate_guard before insert on public.post_comments
for each row execute function public.guard_feed_comment_rate();
