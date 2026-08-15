begin;

create extension if not exists pg_cron with schema extensions;

-- Un nom stable rend la migration rejouable : pg_cron met à jour la tâche
-- existante au lieu d'en créer plusieurs.
select cron.schedule(
  'mata-publish-due-social-posts',
  '* * * * *',
  'select public.publish_due_social_posts()'
);

commit;
