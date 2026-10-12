begin;

-- Extend the existing messaging system; keep booking histories and scoped support access.
create schema if not exists messaging_private;
revoke all on schema messaging_private from public,anon,authenticated;

alter table public.conversations add column if not exists client_id uuid references public.profiles(id);
alter table public.conversations add column if not exists provider_id uuid references public.profiles(id);
alter table public.bookings add column if not exists conversation_id uuid references public.conversations(id);
alter table public.conversation_members add column if not exists archived_at timestamptz;
alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.messages add column if not exists client_nonce uuid;
create unique index if not exists conversations_direct_pair_idx on public.conversations(client_id,provider_id)
  where booking_id is null and client_id is not null and provider_id is not null;
create unique index if not exists messages_sender_nonce_idx on public.messages(sender_id,client_nonce) where client_nonce is not null;
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check(message_type in ('text','image','video','location','system','service','catalog','quote'));

create table if not exists public.message_attachments(
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete restrict,
  bucket_id text not null default 'message-attachments' check(bucket_id='message-attachments'),
  storage_path text not null unique, mime_type text not null, size_bytes integer not null,
  width integer, height integer, created_at timestamptz not null default now()
);
alter table public.message_attachments enable row level security;
alter table public.message_attachments alter column message_id drop not null;
alter table public.message_attachments add column if not exists status text not null default 'ready';
alter table public.message_attachments add column if not exists duration_seconds numeric;
alter table public.message_attachments add column if not exists upload_nonce uuid;
alter table public.message_attachments add column if not exists deleted_at timestamptz;
alter table public.message_attachments drop constraint if exists message_attachments_mime_type_check;
alter table public.message_attachments add constraint message_attachments_mime_type_check check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4'));
alter table public.message_attachments drop constraint if exists message_attachments_size_bytes_check;
alter table public.message_attachments add constraint message_attachments_size_bytes_check check(size_bytes between 1 and 20971520 and (mime_type='video/mp4' or size_bytes<=10485760));
alter table public.message_attachments add constraint message_attachments_status_check check(status in ('pending','ready','rejected'));
alter table public.message_attachments add constraint message_attachments_duration_check check(duration_seconds is null or (duration_seconds>0 and duration_seconds<=60));
create unique index if not exists message_attachments_upload_nonce_idx on public.message_attachments(uploader_id,upload_nonce) where upload_nonce is not null;
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);

create or replace function messaging_private.active_account(target_profile_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=target_profile_id and not p.is_suspended and p.account_status='active');
$$;
create or replace function messaging_private.conversation_parties(target_conversation_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('client_id',coalesce(c.client_id,b.client_id),'provider_id',coalesce(c.provider_id,b.provider_id))
  from public.conversations c left join public.bookings b on b.id=c.booking_id where c.id=target_conversation_id;
$$;
create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select messaging_private.active_account(auth.uid()) and exists(
    select 1 from public.conversation_members m where m.conversation_id=target_conversation_id and m.profile_id=auth.uid()
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public,anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- A historical SECURITY DEFINER list must also respect account revocation.
do $$ declare definition text; begin
  if to_regprocedure('public.list_my_booking_conversations()') is not null then
    definition:=pg_get_functiondef('public.list_my_booking_conversations()'::regprocedure);
    if position('where auth.uid() is not null and' in definition)>0 then
      execute replace(definition,'where auth.uid() is not null and','where public.is_conversation_member(c.id) and');
    elsif position('public.is_conversation_member(c.id)' in definition)=0 then
      raise exception 'Inspect the deployed booking conversation list before migration';
    end if;
  end if;
end $$;

-- Restrictive policies also cover historical or installation-specific permissive policies.
do $$ declare table_name text; begin
  foreach table_name in array array['conversations','conversation_members','messages'] loop
    execute format('create policy "active messaging account" on public.%I as restrictive for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status=''active'')) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and not p.is_suspended and p.account_status=''active''))',table_name);
  end loop;
end $$;

create or replace function public.ensure_provider_conversation(target_provider_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
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
    insert into public.conversations(client_id,provider_id) values(auth.uid(),target_provider_id) returning id into result;
    insert into public.conversation_members(conversation_id,profile_id) values(result,auth.uid()),(result,target_provider_id);
  end if;
  return result;
end $$;

create or replace function public.list_my_conversations()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(item) order by item.last_message_at desc,item.conversation_id),'[]'::jsonb) from (
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
    where public.is_conversation_member(c.id)
    order by coalesce(latest.created_at,c.created_at) desc,c.id limit 200
  ) item;
$$;

create or replace function public.get_my_conversation(target_conversation_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(item) from (
    select c.id as conversation_id,coalesce(c.booking_id,b.id) as booking_id,coalesce(c.client_id,b.client_id) as client_id,coalesce(c.provider_id,b.provider_id) as provider_id,
      b.starts_at,b.status,s.title as service_title,op.id as other_profile_id,
      coalesce(nullif(pp.business_name,''),nullif(case when op.display_name ~* '^(provider-|[a-f0-9]{8}-)' then null else op.display_name end,''),nullif(trim(coalesce(op.first_name,'')||' '||coalesce(op.last_name,'')),''),case when pp.profile_id is null then 'Client' else 'Professionnel' end) as other_display_name,
      op.avatar_url as other_avatar_url,
      (select count(*) from public.messages m where m.conversation_id=c.id and m.deleted_at is null and m.sender_id<>auth.uid() and m.created_at>coalesce(cm.last_read_at,'epoch')) as unread_count,
      coalesce(latest.created_at,c.created_at) as last_message_at,latest.body as last_message_body,latest.message_type as last_message_type,cm.archived_at
    from public.conversations c join public.conversation_members cm on cm.conversation_id=c.id and cm.profile_id=auth.uid()
    left join lateral(select linked.* from public.bookings linked where linked.id=c.booking_id or linked.conversation_id=c.id order by linked.created_at desc,linked.id limit 1) b on true
    left join public.provider_services s on s.id=b.provider_service_id
    join public.profiles op on op.id=case when coalesce(c.client_id,b.client_id)=auth.uid() then coalesce(c.provider_id,b.provider_id) else coalesce(c.client_id,b.client_id) end
    left join public.provider_profiles pp on pp.profile_id=op.id
    left join lateral(select m.body,m.message_type,m.created_at from public.messages m where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc,m.id desc limit 1) latest on true
    where c.id=target_conversation_id and public.is_conversation_member(c.id)
  ) item;
$$;

create or replace function messaging_private.keep_booking_conversation()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.conversation_id is distinct from old.conversation_id then raise exception 'Le lien de conversation de la réservation ne peut pas être modifié' using errcode='42501'; end if;
  return new;
end $$;
create trigger bookings_keep_conversation before update of conversation_id on public.bookings for each row execute function messaging_private.keep_booking_conversation();

create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare read_time timestamptz:=now();
begin
  if not public.is_conversation_member(target_conversation_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  update public.conversation_members set last_read_at=read_time where conversation_id=target_conversation_id and profile_id=auth.uid();
  update public.notifications set read_at=coalesce(read_at,read_time) where profile_id=auth.uid() and data->>'conversation_id'=target_conversation_id::text and read_at is null;
  return read_time;
end $$;

create or replace function public.ensure_booking_conversation(target_booking_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare booking public.bookings%rowtype; result uuid;
begin
  if not messaging_private.active_account(auth.uid()) then raise exception 'Compte actif requis' using errcode='42501'; end if;
  select * into booking from public.bookings where id=target_booking_id;
  if booking.id is null or (auth.uid() not in (booking.client_id,booking.provider_id) and not exists(select 1 from public.collaborators col where col.id=booking.collaborator_id and col.profile_id=auth.uid() and col.is_active)) then
    raise exception 'Réservation inaccessible' using errcode='42501';
  end if;
  if booking.conversation_id is not null then
    if not public.is_conversation_member(booking.conversation_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
    return booking.conversation_id;
  end if;
  insert into public.conversations(booking_id) values(target_booking_id) on conflict(booking_id) where booking_id is not null do nothing;
  select id into result from public.conversations where booking_id=target_booking_id;
  insert into public.conversation_members(conversation_id,profile_id) values(result,booking.client_id),(result,booking.provider_id) on conflict do nothing;
  return result;
end $$;

create or replace function public.ensure_booking_conversation_on_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare result uuid; parties jsonb;
begin
  if new.conversation_id is not null then
    parties:=messaging_private.conversation_parties(new.conversation_id);
    if parties is null or (parties->>'client_id')::uuid is distinct from new.client_id or (parties->>'provider_id')::uuid is distinct from new.provider_id then raise exception 'Conversation et réservation incohérentes'; end if;
    result:=new.conversation_id;
  else
    insert into public.conversations(booking_id) values(new.id) on conflict(booking_id) where booking_id is not null do update set updated_at=excluded.updated_at returning id into result;
  end if;
  insert into public.conversation_members(conversation_id,profile_id) values(result,new.client_id),(result,new.provider_id) on conflict do nothing;
  return new;
end $$;

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(profile_id,kind,title,body,data)
    select member.profile_id,'message_created',case new.message_type when 'quote' then 'Nouveau devis' when 'image' then 'Nouvelle photo' when 'video' then 'Nouvelle vidéo' else 'Nouveau message' end,
      'Une nouvelle activité vous attend dans votre conversation.',
      jsonb_build_object('conversation_id',new.conversation_id,'message_id',new.id,'href',case when p.role::text='client' then '/app/messages' else '/pro/messages' end||'?conversation='||new.conversation_id::text||'&message='||new.id::text)
    from public.conversation_members member join public.profiles p on p.id=member.profile_id
    where member.conversation_id=new.conversation_id and member.profile_id<>new.sender_id and messaging_private.active_account(member.profile_id);
  return new;
end $$;

create or replace function messaging_private.guard_message()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not messaging_private.active_account(new.sender_id) or not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and profile_id=new.sender_id) then
    raise exception 'Conversation inaccessible' using errcode='42501';
  end if;
  if auth.uid() is not null and auth.uid()<>new.sender_id then raise exception 'Expéditeur invalide' using errcode='42501'; end if;
  -- A direct REST insert must not forge timestamps to bypass rate limits or
  -- unread ordering. Server fixture imports keep their deliberate chronology.
  if auth.uid() is not null then new.created_at:=clock_timestamp(); new.edited_at:=null; new.deleted_at:=null; end if;
  perform pg_advisory_xact_lock(hashtextextended('message:'||new.sender_id::text,0));
  if (select count(*) from public.messages m where m.sender_id=new.sender_id and m.created_at>clock_timestamp()-interval '1 minute')>=30 then
    raise exception 'Envois trop fréquents. Réessayez dans une minute.';
  end if;
  if new.message_type<>'text' and current_setting('app.message_enriched',true) is distinct from 'true' then
    raise exception 'Utilisez le service sécurisé de messagerie' using errcode='42501';
  end if;
  if new.message_type='text' and new.metadata<>'{}'::jsonb then raise exception 'Métadonnées non autorisées' using errcode='42501'; end if;
  return new;
end $$;
create trigger messages_server_guard before insert on public.messages for each row execute function messaging_private.guard_message();

-- Keep the deployed anti-circumvention screening and its risk audit. Wrap it for retries.
do $$ begin
  if to_regprocedure('public.send_conversation_message(uuid,text,uuid)') is not null then
    alter function public.send_conversation_message(uuid,text,uuid) set schema messaging_private;
    alter function messaging_private.send_conversation_message(uuid,text,uuid) rename to screened_text_message;
    revoke all on function messaging_private.screened_text_message(uuid,text,uuid) from public,anon,authenticated;
  end if;
end $$;
create or replace function public.send_conversation_message(target_conversation_id uuid,target_body text,target_client_nonce uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.messages%rowtype; created public.messages%rowtype; result jsonb;
begin
  if not public.is_conversation_member(target_conversation_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  if nullif(trim(target_body),'') is null or char_length(target_body)>4000 then raise exception 'Message invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended('message:'||auth.uid()::text,0));
  if target_client_nonce is not null then
    select * into existing from public.messages where sender_id=auth.uid() and client_nonce=target_client_nonce;
    if existing.id is not null then
      if existing.conversation_id<>target_conversation_id or existing.body<>trim(target_body) or existing.message_type<>'text' then raise exception 'Identifiant d’envoi déjà utilisé'; end if;
      return jsonb_build_object('ok',true,'message',to_jsonb(existing));
    end if;
  end if;
  if to_regprocedure('messaging_private.screened_text_message(uuid,text,uuid)') is not null then
    execute 'select messaging_private.screened_text_message($1,$2,$3)' into result using target_conversation_id,target_body,target_client_nonce;
    return result;
  end if;
  insert into public.messages(conversation_id,sender_id,body,message_type,client_nonce) values(target_conversation_id,auth.uid(),trim(target_body),'text',target_client_nonce) returning * into created;
  return jsonb_build_object('ok',true,'message',to_jsonb(created));
end $$;

create or replace function public.send_conversation_reference(target_conversation_id uuid,target_service_id uuid,target_catalog boolean,target_client_nonce uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare parties jsonb; provider uuid; service public.provider_services%rowtype; created public.messages%rowtype; kind text;
begin
  if not public.is_conversation_member(target_conversation_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  parties:=messaging_private.conversation_parties(target_conversation_id); provider:=(parties->>'provider_id')::uuid;
  if not messaging_private.active_account(provider) or not exists(select 1 from public.provider_profiles where profile_id=provider and status='approved') then raise exception 'Professionnel indisponible'; end if;
  kind:=case when target_catalog then 'catalog' else 'service' end;
  if not target_catalog then
    select ps.* into service from public.provider_services ps where ps.id=target_service_id and ps.provider_id=provider and ps.is_active
      and ps.archived_at is null and coalesce(to_jsonb(ps)->>'status','published')='published'
      and (ps.business_id is null or exists(select 1 from public.businesses b where b.id=ps.business_id and b.is_active and b.archived_at is null and b.status='approved'));
    if service.id is null then raise exception 'Prestation indisponible'; end if;
  elsif target_service_id is not null then raise exception 'Référence invalide'; end if;
  if target_client_nonce is null then raise exception 'Identifiant d’envoi requis'; end if;
  perform pg_advisory_xact_lock(hashtextextended('message:'||auth.uid()::text,0));
  select * into created from public.messages where sender_id=auth.uid() and client_nonce=target_client_nonce;
  if created.id is not null then
    if created.conversation_id<>target_conversation_id or created.message_type<>kind or coalesce(created.metadata->>'service_id','')<>coalesce(target_service_id::text,'') then raise exception 'Identifiant d’envoi déjà utilisé'; end if;
  else
    perform set_config('app.message_enriched','true',true);
    insert into public.messages(conversation_id,sender_id,body,message_type,metadata,client_nonce)
    values(target_conversation_id,auth.uid(),case when target_catalog then 'Catalogue de prestations' else service.title end,kind,jsonb_build_object('provider_id',provider,'service_id',target_service_id),target_client_nonce) returning * into created;
  end if;
  return jsonb_build_object('ok',true,'message',to_jsonb(created));
end $$;

-- Pending uploads are never visible to another participant and cannot be attached by a browser.
do $$ declare policy record; begin
  for policy in select policyname from pg_policies where schemaname='public' and tablename='message_attachments' loop
    execute format('drop policy %I on public.message_attachments',policy.policyname);
  end loop;
end $$;
create policy "validated conversation attachments" on public.message_attachments for select to authenticated
  using(public.is_conversation_member(conversation_id) and deleted_at is null and (status='ready' or uploader_id=auth.uid()));
revoke all on public.message_attachments from anon,authenticated;
grant select on public.message_attachments to authenticated;
grant all on public.message_attachments to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('message-attachments','message-attachments',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "message attachments owner delete" on storage.objects;
drop policy if exists "message attachments participant upload" on storage.objects;
drop policy if exists "message attachments scoped read" on storage.objects;
-- Upload and download signing happen on the verified server; no raw object access bypasses validation.
create policy "message media server validation required" on storage.objects as restrictive for all to authenticated
  using(bucket_id<>'message-attachments') with check(bucket_id<>'message-attachments');

create or replace function public.prepare_message_attachment(target_actor_id uuid,target_conversation_id uuid,target_mime_type text,target_size_bytes integer,target_client_nonce uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attachment public.message_attachments%rowtype; ext text;
begin
  if not messaging_private.active_account(target_actor_id) or not exists(select 1 from public.conversation_members where profile_id=target_actor_id and conversation_id=target_conversation_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  if target_client_nonce is null or target_mime_type not in ('image/jpeg','image/png','image/webp','video/mp4') or target_size_bytes<1 or target_size_bytes>(case when target_mime_type='video/mp4' then 20971520 else 10485760 end) then raise exception 'Fichier invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended('upload:'||target_actor_id::text,0));
  select * into attachment from public.message_attachments where uploader_id=target_actor_id and upload_nonce=target_client_nonce;
  if attachment.id is not null then
    if attachment.conversation_id<>target_conversation_id or attachment.mime_type<>target_mime_type or (attachment.status='pending' and attachment.size_bytes<>target_size_bytes) then raise exception 'Identifiant d’envoi déjà utilisé'; end if;
    return to_jsonb(attachment);
  end if;
  if (select count(*) from public.message_attachments where uploader_id=target_actor_id and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'Limite de médias atteinte. Réessayez plus tard.'; end if;
  attachment.id:=gen_random_uuid(); ext:=case target_mime_type when 'video/mp4' then '.mp4' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end;
  insert into public.message_attachments(id,conversation_id,uploader_id,storage_path,mime_type,size_bytes,status,upload_nonce)
    values(attachment.id,target_conversation_id,target_actor_id,target_conversation_id::text||'/'||target_actor_id::text||'/'||attachment.id::text||ext,target_mime_type,target_size_bytes,'pending',target_client_nonce) returning * into attachment;
  return to_jsonb(attachment);
end $$;

create or replace function public.complete_message_attachment(target_actor_id uuid,target_attachment_id uuid,target_width integer,target_height integer,target_duration_seconds numeric,target_size_bytes integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attachment public.message_attachments%rowtype; created public.messages%rowtype;
begin
  select * into attachment from public.message_attachments where id=target_attachment_id and uploader_id=target_actor_id for update;
  if attachment.id is null or not messaging_private.active_account(target_actor_id) or not exists(select 1 from public.conversation_members where profile_id=target_actor_id and conversation_id=attachment.conversation_id) then raise exception 'Conversation inaccessible' using errcode='42501'; end if;
  if attachment.status='ready' then select * into created from public.messages where id=attachment.message_id; return jsonb_build_object('message',to_jsonb(created)); end if;
  if attachment.status<>'pending' or attachment.created_at<now()-interval '2 hours' then raise exception 'Téléversement expiré'; end if;
  perform set_config('app.message_enriched','true',true);
  insert into public.messages(conversation_id,sender_id,body,message_type,metadata,client_nonce)
    values(attachment.conversation_id,target_actor_id,case when attachment.mime_type='video/mp4' then 'Vidéo' else 'Photo' end,case when attachment.mime_type='video/mp4' then 'video' else 'image' end,jsonb_build_object('attachment_id',attachment.id),attachment.upload_nonce) returning * into created;
  update public.message_attachments set message_id=created.id,status='ready',width=target_width,height=target_height,duration_seconds=target_duration_seconds,size_bytes=target_size_bytes,
    storage_path=regexp_replace(storage_path,'(\.[a-z]+)$','-validated\1') where id=attachment.id;
  return jsonb_build_object('message',to_jsonb(created));
end $$;

revoke all on all functions in schema messaging_private from public,anon,authenticated;
revoke all on function public.ensure_provider_conversation(uuid),public.list_my_conversations(),public.get_my_conversation(uuid),public.mark_conversation_read(uuid),public.send_conversation_message(uuid,text,uuid),public.send_conversation_reference(uuid,uuid,boolean,uuid) from public,anon;
grant execute on function public.ensure_provider_conversation(uuid),public.list_my_conversations(),public.get_my_conversation(uuid),public.mark_conversation_read(uuid),public.send_conversation_message(uuid,text,uuid),public.send_conversation_reference(uuid,uuid,boolean,uuid) to authenticated;
revoke all on function public.prepare_message_attachment(uuid,uuid,text,integer,uuid),public.complete_message_attachment(uuid,uuid,integer,integer,numeric,integer) from public,anon,authenticated;
grant execute on function public.prepare_message_attachment(uuid,uuid,text,integer,uuid),public.complete_message_attachment(uuid,uuid,integer,integer,numeric,integer) to service_role;
notify pgrst,'reload schema';
commit;
