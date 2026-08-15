begin;

create or replace function public.notify_post_engagement()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_owner uuid; target_kind text; target_title text; actor uuid; row_data jsonb;
begin
  row_data:=to_jsonb(new);
  actor:=coalesce(nullif(row_data->>'profile_id',''),nullif(row_data->>'author_id',''))::uuid;
  select post.author_id into target_owner from public.posts post where post.id=new.post_id;
  if target_owner is null or target_owner=actor or not public.social_notifications_enabled(target_owner) then return new; end if;
  target_kind:=case when tg_table_name='post_likes' then 'post_liked' else 'post_commented' end;
  target_title:=case when tg_table_name='post_likes' then 'Nouvelle mention J’aime' else 'Nouveau commentaire' end;
  if exists(select 1 from public.notifications notification where notification.profile_id=target_owner and notification.kind=target_kind and notification.data->>'post_id'=new.post_id::text and notification.data->>'actor_id'=actor::text and notification.created_at>now()-interval '24 hours') then return new; end if;
  insert into public.notifications(profile_id,kind,title,body,data) values(target_owner,target_kind,target_title,
    case when tg_table_name='post_likes' then 'Une personne aime votre publication.' else 'Une personne a commenté votre publication.' end,
    jsonb_build_object('post_id',new.post_id,'actor_id',actor));
  return new;
end; $$;
revoke all on function public.notify_post_engagement() from public,anon,authenticated;

commit;
