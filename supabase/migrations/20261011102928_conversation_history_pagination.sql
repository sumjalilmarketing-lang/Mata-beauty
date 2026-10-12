begin;
-- One participant-scoped projection for inbox pages and old notification links.
create or replace function messaging_private.conversation_summaries(target_id uuid,target_before_at timestamptz,target_before_id uuid,target_limit integer)
returns jsonb language sql stable security definer set search_path='' as $body$
  select coalesce(jsonb_agg(to_jsonb(item) order by item.last_message_at desc,item.conversation_id desc),'[]'::jsonb) from (
    select c.id as conversation_id,coalesce(c.booking_id,b.id) as booking_id,coalesce(c.client_id,b.client_id) as client_id,coalesce(c.provider_id,b.provider_id) as provider_id,
      b.starts_at,b.status,s.title as service_title,op.id as other_profile_id,
      coalesce(nullif(pp.business_name,''),nullif(case when op.display_name ~* '^(provider-|[a-f0-9]{8}-)' then null else op.display_name end,''),nullif(trim(coalesce(op.first_name,'')||' '||coalesce(op.last_name,'')),''),case when pp.profile_id is null then 'Client' else 'Professionnel' end) as other_display_name,
      op.avatar_url as other_avatar_url,
      (select count(*) from public.messages m where m.conversation_id=c.id and m.deleted_at is null and m.sender_id<>auth.uid() and m.created_at>coalesce(cm.last_read_at,'epoch')) as unread_count,
      coalesce(latest.created_at,c.created_at) as last_message_at,latest.body as last_message_body,latest.message_type as last_message_type,cm.archived_at
    from public.conversations c join public.conversation_members cm on cm.conversation_id=c.id and cm.profile_id=auth.uid()
    left join lateral(select linked.* from public.bookings linked where linked.id=c.booking_id or linked.conversation_id=c.id order by linked.created_at desc,linked.id limit 1) b on true left join public.provider_services s on s.id=b.provider_service_id
    join public.profiles op on op.id=case when coalesce(c.client_id,b.client_id)=auth.uid() then coalesce(c.provider_id,b.provider_id) else coalesce(c.client_id,b.client_id) end
    left join public.provider_profiles pp on pp.profile_id=op.id
    left join lateral(select m.body,m.message_type,m.created_at from public.messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc,m.id desc limit 1) latest on true
    where public.is_conversation_member(c.id) and (target_id is null or c.id=target_id) and (target_before_at is null or (coalesce(latest.created_at,c.created_at),c.id)<(target_before_at,target_before_id))
    order by coalesce(latest.created_at,c.created_at) desc,c.id desc limit greatest(1,least(coalesce(target_limit,50),200))
  ) item;
$body$;
revoke all on function messaging_private.conversation_summaries(uuid,timestamptz,uuid,integer) from public,anon,authenticated;
create or replace function public.list_my_conversations_page(target_before_at timestamptz default null,target_before_id uuid default null,target_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $body$
begin
  if (target_before_at is null) <> (target_before_id is null) then raise exception 'Curseur de conversation invalide'; end if;
  return messaging_private.conversation_summaries(null,target_before_at,target_before_id,target_limit);
end $body$;
create or replace function public.list_my_conversations()
returns jsonb language sql stable security definer set search_path='' as $body$
  select messaging_private.conversation_summaries(null,null,null,200);
$body$;
create or replace function public.get_my_conversation(target_conversation_id uuid)
returns jsonb language sql stable security definer set search_path='' as $body$
  select messaging_private.conversation_summaries(target_conversation_id,null,null,1)->0 where target_conversation_id is not null;
$body$;
revoke all on function public.list_my_conversations_page(timestamptz,uuid,integer) from public,anon;
grant execute on function public.list_my_conversations_page(timestamptz,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;