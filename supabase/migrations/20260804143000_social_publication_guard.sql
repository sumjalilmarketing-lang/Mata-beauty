-- Empêche de contourner create_video_post par une écriture directe sur posts.

drop policy if exists "authors manage own posts" on public.posts;
create policy "authors manage own posts" on public.posts
for all
using (author_id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (
    author_id = auth.uid()
    and position('/storage/v1/object/public/social-videos/' in video_url) > 0
    and (
      status not in ('published', 'scheduled')
      or exists (
        select 1 from public.provider_profiles provider
        where provider.profile_id = auth.uid() and provider.status = 'approved'
      )
    )
    and (status <> 'published' or client_consent_confirmed)
    and (status <> 'scheduled' or (scheduled_for is not null and scheduled_for > now()))
  )
);

create or replace function public.guard_social_post_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('published', 'scheduled') and not exists (
    select 1 from public.provider_profiles
    where profile_id = new.author_id and status = 'approved'
  ) then
    raise exception 'Profil professionnel non approuvé';
  end if;
  if new.status = 'published' and not new.client_consent_confirmed then
    raise exception 'Le consentement client est obligatoire';
  end if;
  if position('/storage/v1/object/public/social-videos/' in new.video_url) = 0 then
    raise exception 'URL vidéo invalide';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_publication on public.posts;
create trigger posts_guard_publication
before insert or update of status, video_url, client_consent_confirmed, scheduled_for
on public.posts
for each row execute function public.guard_social_post_publication();
