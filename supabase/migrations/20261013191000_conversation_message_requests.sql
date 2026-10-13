begin;

-- Requests extend the existing conversation rather than creating a second inbox.
alter table public.conversations
  add column request_status text not null default 'accepted'
    check (request_status in ('pending','accepted','declined')),
  add column requested_by uuid references public.profiles(id) on delete cascade,
  add column request_decided_at timestamptz;
alter table public.conversations add constraint conversation_request_state_consistent check (
  (request_status = 'accepted' and request_decided_at is not null or request_status = 'accepted' and requested_by is null)
  or (request_status = 'pending' and requested_by is not null and request_decided_at is null)
  or (request_status = 'declined' and requested_by is not null and request_decided_at is not null)
);
create index conversations_incoming_requests_idx on public.conversations (provider_id, created_at desc)
  where booking_id is null and request_status = 'pending';

create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select messaging_private.active_account(auth.uid()) and exists (
    select 1 from public.conversation_members m join public.conversations c on c.id=m.conversation_id
    where m.conversation_id=target_conversation_id and m.profile_id=auth.uid()
      and (c.request_status='accepted' or c.requested_by=auth.uid() or c.request_status='pending')
  );
$function$;
revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

create or replace function public.ensure_provider_conversation(target_provider_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare result uuid;
begin
  if not messaging_private.active_account(auth.uid()) or auth.uid()=target_provider_id then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  if not exists(select 1 from public.provider_profiles pp where pp.profile_id=target_provider_id and pp.status='approved' and messaging_private.active_account(pp.profile_id)) then
    raise exception 'Professionnel indisponible' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('conversation:'||auth.uid()::text||':'||target_provider_id::text,0));
  select id into result from public.conversations where booking_id is null and client_id=auth.uid() and provider_id=target_provider_id;
  if result is null then
    if (select count(*) from public.conversations where client_id=auth.uid() and created_at>now()-interval '1 hour')>=15 then raise exception 'Trop de nouvelles conversations. Réessayez plus tard.' using errcode='P0001'; end if;
    insert into public.conversations(client_id,provider_id,request_status,requested_by)
      values(auth.uid(),target_provider_id,'pending',auth.uid()) returning id into result;
    insert into public.conversation_members(conversation_id,profile_id) values(result,auth.uid()),(result,target_provider_id);
  end if;
  return result;
end $function$;
revoke all on function public.ensure_provider_conversation(uuid) from public,anon;
grant execute on function public.ensure_provider_conversation(uuid) to authenticated;

-- Keep all existing salon permission, account and anti-spam checks. A direct request
-- permits only one initial message from its requester until the provider accepts.
create or replace function messaging_private.guard_message() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare request_state text; requester uuid;
begin
  if not messaging_private.active_account(new.sender_id) or not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and profile_id=new.sender_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  if auth.uid() is not null and auth.uid()<>new.sender_id then raise exception 'Expéditeur invalide' using errcode='42501'; end if;
  select c.request_status,c.requested_by into request_state,requester from public.conversations c where c.id=new.conversation_id;
  if request_state='pending' then
    if new.sender_id is distinct from requester or exists(select 1 from public.messages m where m.conversation_id=new.conversation_id and m.deleted_at is null) then
      raise exception 'Acceptez la demande avant de répondre' using errcode='42501';
    end if;
  elsif request_state='declined' then
    raise exception 'Cette demande de message a été refusée' using errcode='42501';
  end if;
  if exists(select 1 from public.conversations conv join public.bookings b on b.id=conv.booking_id or b.conversation_id=conv.id join booking_private.collaborator_access a on a.collaborator_id=b.collaborator_id where conv.id=new.conversation_id and a.profile_id=new.sender_id and not 'messages.reply'=any(a.staff_permissions)) then raise exception 'Envoi de message non autorisé' using errcode='42501'; end if;
  if auth.uid() is not null then new.created_at:=clock_timestamp(); new.edited_at:=null; new.deleted_at:=null; end if;
  perform pg_advisory_xact_lock(hashtextextended('message:'||new.sender_id::text,0));
  if (select count(*) from public.messages m where m.sender_id=new.sender_id and m.created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'Envois trop fréquents. Réessayez dans une minute.'; end if;
  if new.message_type<>'text' and current_setting('app.message_enriched',true) is distinct from 'true' then raise exception 'Utilisez le service sécurisé de messagerie' using errcode='42501'; end if;
  if new.message_type='text' and new.metadata<>'{}'::jsonb then raise exception 'Métadonnées non autorisées' using errcode='42501'; end if;
  return new;
end $function$;

create or replace function public.list_my_message_requests()
returns jsonb language sql stable security definer set search_path = '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id', c.id, 'requester_id', c.requested_by,
    'requester_name', item.value->>'other_display_name',
    'requester_avatar_url', item.value->>'other_avatar_url',
    'preview', item.value->>'last_message_body',
    'message_type', item.value->>'last_message_type',
    'requested_at', c.created_at
  ) order by c.created_at desc), '[]'::jsonb)
  from jsonb_array_elements(messaging_private.conversation_summaries(null,null,null,200)) item(value)
  join public.conversations c on c.id=(item.value->>'conversation_id')::uuid
  where auth.uid() is not null and c.provider_id=auth.uid() and c.booking_id is null
    and c.request_status='pending' and c.requested_by is distinct from auth.uid();
$function$;

create or replace function public.respond_to_message_request(target_conversation_id uuid, accept_request boolean)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare requester uuid; next_state text;
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501'; end if;
  if not messaging_private.active_account(auth.uid())
    or not exists(select 1 from public.provider_profiles where profile_id=auth.uid() and status='approved') then
    raise exception 'Compte professionnel indisponible' using errcode='42501';
  end if;
  next_state:=case when accept_request then 'accepted' else 'declined' end;
  update public.conversations c set request_status=next_state,request_decided_at=now()
    where c.id=target_conversation_id and c.provider_id=auth.uid() and c.booking_id is null and c.request_status='pending'
    returning c.requested_by into requester;
  if requester is null then return false; end if;
  insert into public.notifications(profile_id,kind,title,body,data)
    values(requester,'message_request_'||next_state,
      case when accept_request then 'Demande de message acceptée' else 'Demande de message refusée' end,
      case when accept_request then 'Vous pouvez poursuivre votre conversation.' else 'Votre demande de conversation n’a pas été acceptée.' end,
      jsonb_build_object('conversationId',target_conversation_id));
  return true;
end $function$;

-- Enrich the existing participant-scoped summaries with only the request state
-- needed by the UI. No additional conversation rows become visible.
create or replace function public.list_my_conversations_page(target_before_at timestamptz default null,target_before_id uuid default null,target_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare rows jsonb; enriched jsonb;
begin
  if (target_before_at is null) <> (target_before_id is null) then raise exception 'Curseur de conversation invalide'; end if;
  rows:=messaging_private.conversation_summaries(null,target_before_at,target_before_id,target_limit);
  select coalesce(jsonb_agg(item.value || jsonb_build_object('request_status',c.request_status,'requested_by',c.requested_by)), '[]'::jsonb)
    into enriched from jsonb_array_elements(rows) item(value)
    join public.conversations c on c.id=(item.value->>'conversation_id')::uuid;
  return enriched;
end $function$;

create or replace function public.list_my_conversations()
returns jsonb language sql stable security definer set search_path = '' as $function$
  select coalesce(jsonb_agg(item.value || jsonb_build_object('request_status',c.request_status,'requested_by',c.requested_by)), '[]'::jsonb)
  from jsonb_array_elements(messaging_private.conversation_summaries(null,null,null,200)) item(value)
  join public.conversations c on c.id=(item.value->>'conversation_id')::uuid;
$function$;

create or replace function public.get_my_conversation(target_conversation_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select item.value || jsonb_build_object('request_status',c.request_status,'requested_by',c.requested_by)
  from jsonb_array_elements(messaging_private.conversation_summaries(target_conversation_id,null,null,1)) item(value)
  join public.conversations c on c.id=(item.value->>'conversation_id')::uuid
  where target_conversation_id is not null;
$function$;

revoke all on function public.list_my_message_requests() from public,anon;
grant execute on function public.list_my_message_requests() to authenticated;
revoke all on function public.respond_to_message_request(uuid,boolean) from public,anon;
grant execute on function public.respond_to_message_request(uuid,boolean) to authenticated;
revoke all on function public.list_my_conversations_page(timestamptz,uuid,integer),public.list_my_conversations(),public.get_my_conversation(uuid) from public,anon;
grant execute on function public.list_my_conversations_page(timestamptz,uuid,integer),public.list_my_conversations(),public.get_my_conversation(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
