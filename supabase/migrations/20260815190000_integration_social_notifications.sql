-- Notifications sociales centralisées. Les écritures restent serveur et respectent les préférences.

create or replace function public.social_notifications_enabled(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select preferences.social_in_app
    from public.notification_preferences preferences
    where preferences.profile_id = target_profile_id
  ), true)
$$;

create or replace function public.notify_post_engagement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner uuid;
  target_kind text;
  target_title text;
  actor uuid;
begin
  actor := case when tg_table_name = 'post_likes' then new.profile_id else new.author_id end;
  select post.author_id into target_owner from public.posts post where post.id = new.post_id;
  if target_owner is null or target_owner = actor or not public.social_notifications_enabled(target_owner) then return new; end if;

  target_kind := case when tg_table_name = 'post_likes' then 'post_liked' else 'post_commented' end;
  target_title := case when tg_table_name = 'post_likes' then 'Nouvelle mention J’aime' else 'Nouveau commentaire' end;
  if exists (
    select 1 from public.notifications notification
    where notification.profile_id = target_owner
      and notification.kind = target_kind
      and notification.data->>'post_id' = new.post_id::text
      and notification.data->>'actor_id' = actor::text
      and notification.created_at > now() - interval '24 hours'
  ) then return new; end if;

  insert into public.notifications(profile_id, kind, title, body, data)
  values (
    target_owner,
    target_kind,
    target_title,
    case when tg_table_name = 'post_likes' then 'Une personne aime votre publication.' else 'Une personne a commenté votre publication.' end,
    jsonb_build_object('post_id', new.post_id, 'actor_id', actor)
  );
  return new;
end;
$$;

create or replace function public.notify_review_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider_id <> new.client_id and public.social_notifications_enabled(new.provider_id) then
    insert into public.notifications(profile_id, kind, title, body, data)
    values (
      new.provider_id,
      'review_created',
      'Nouvel avis vérifié',
      'Une cliente a publié un avis après une prestation terminée.',
      jsonb_build_object('review_id', new.id, 'booking_id', new.booking_id, 'rating', new.rating)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists post_likes_notify_owner on public.post_likes;
create trigger post_likes_notify_owner after insert on public.post_likes
for each row execute function public.notify_post_engagement();

drop trigger if exists post_comments_notify_owner on public.post_comments;
create trigger post_comments_notify_owner after insert on public.post_comments
for each row execute function public.notify_post_engagement();

drop trigger if exists reviews_notify_provider on public.reviews;
create trigger reviews_notify_provider after insert on public.reviews
for each row execute function public.notify_review_created();

revoke all on function public.social_notifications_enabled(uuid) from public, anon, authenticated;
revoke all on function public.notify_post_engagement() from public, anon, authenticated;
revoke all on function public.notify_review_created() from public, anon, authenticated;

comment on function public.notify_post_engagement() is 'Crée une notification privée, préférencée et anti-spam pour un like ou commentaire.';
comment on function public.notify_review_created() is 'Notifie le prestataire après la création RLS-validée d un avis lié à une réservation terminée.';
