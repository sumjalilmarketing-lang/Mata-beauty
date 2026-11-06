begin;
-- Reuse the canonical, filtered feed while resolving each published salon's
-- live identity from the exact service. Do not change its moderation filters.
do $$ declare definition text;begin
 definition:=pg_get_viewdef('public.social_feed'::regclass,true);
 if strpos(definition,'pp.business_name,')=0 or strpos(definition,'FROM posts p')=0 or strpos(definition,'WHERE p.status')=0 then
  raise exception 'Unexpected feed shape; identity migration requires review';
 end if;
 definition:=replace(definition,'pp.business_name,','COALESCE(salon.name,pp.business_name) AS business_name,');
 definition:=replace(definition,'FROM posts p',', salon.slug AS business_slug FROM posts p');
 definition:=replace(definition,'WHERE p.status','LEFT JOIN public.businesses salon ON salon.id=svc.business_id AND salon.owner_id=pp.profile_id AND salon.status=''approved'' AND salon.is_active AND salon.archived_at IS NULL WHERE p.status');
 execute 'create or replace view public.social_feed as '||definition;
end $$;

create or replace function public.my_unread_inbox_counts()
returns jsonb language sql stable security definer set search_path='' as $$
 with unread_messages as (
  select m.id,c.booking_id from public.conversation_members member
  join public.messages m on m.conversation_id=member.conversation_id
  join public.conversations c on c.id=member.conversation_id
  where member.profile_id=auth.uid() and public.is_conversation_member(member.conversation_id)
   and m.sender_id<>auth.uid() and m.deleted_at is null
   and m.created_at>coalesce(member.last_read_at,'-infinity'::timestamptz)
 ), unread_notifications as (
  select n.kind,n.data from public.notifications n where n.profile_id=auth.uid() and n.read_at is null and n.dismissed_at is null
 ), booking_updates as (
  select booking_id::text as id from unread_messages where booking_id is not null
  union
  select lower(data->>'booking_id') from unread_notifications
   where kind in ('booking_created','booking_status_changed','booking_assignment','booking_reminder','appointment_reminder')
    and data->>'booking_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 )
 select case when exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and not p.is_suspended)
  then jsonb_build_object('messages',(select count(*) from unread_messages),'notifications',(select count(*) from unread_notifications),'bookings',(select count(*) from booking_updates))
  else jsonb_build_object('messages',0,'notifications',0,'bookings',0) end;
$$;
revoke all on function public.my_unread_inbox_counts() from public,anon;
grant execute on function public.my_unread_inbox_counts() to authenticated;
notify pgrst,'reload schema';
commit;
