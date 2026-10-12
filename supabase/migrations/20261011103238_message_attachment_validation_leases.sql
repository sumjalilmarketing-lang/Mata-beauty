begin;

alter table public.message_attachments
  add column validation_attempts integer not null default 0 check(validation_attempts between 0 and 5),
  add column validation_lease_id uuid,
  add column validation_lease_until timestamptz;

-- Only the verified application server may claim validation work. The row lock
-- makes simultaneous complete requests consume one attempt, not many parsers.
create function public.claim_message_attachment_validation(target_actor_id uuid,target_attachment_id uuid,target_client_nonce uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attachment public.message_attachments%rowtype; created public.messages%rowtype; lease uuid; checked_at timestamptz;
begin
  select * into attachment from public.message_attachments where id=target_attachment_id for update;
  checked_at:=clock_timestamp();
  if attachment.id is null or attachment.uploader_id is distinct from target_actor_id
    or attachment.upload_nonce is distinct from target_client_nonce or target_client_nonce is null
    or attachment.deleted_at is not null or not messaging_private.active_account(target_actor_id)
    or not exists(select 1 from public.conversation_members where profile_id=target_actor_id and conversation_id=attachment.conversation_id) then
    raise exception 'Média inaccessible' using errcode='42501';
  end if;
  if attachment.status='ready' then
    select * into created from public.messages where id=attachment.message_id and deleted_at is null;
    if created.id is null then raise exception 'Média inaccessible' using errcode='42501'; end if;
    return jsonb_build_object('status','ready','message',to_jsonb(created));
  end if;
  if attachment.status<>'pending' or attachment.created_at<checked_at-interval '2 hours' then return jsonb_build_object('status','expired'); end if;
  if attachment.validation_lease_until>checked_at then
    return jsonb_build_object('status','busy','retry_after_seconds',greatest(1,least(60,ceil(extract(epoch from attachment.validation_lease_until-checked_at))::integer)));
  end if;
  if attachment.validation_attempts>=5 then return jsonb_build_object('status','exhausted'); end if;
  lease:=gen_random_uuid();
  update public.message_attachments set validation_attempts=validation_attempts+1,
    validation_lease_id=lease,validation_lease_until=checked_at+interval '60 seconds' where id=attachment.id;
  return jsonb_build_object('status','claimed','lease_id',lease);
end $$;

-- Remove the old service-only signature, so finalization cannot accidentally
-- omit the lease. Idempotent ready retries still return the original message.
drop function public.complete_message_attachment(uuid,uuid,integer,integer,numeric,integer);
create function public.complete_message_attachment(target_actor_id uuid,target_attachment_id uuid,target_width integer,target_height integer,target_duration_seconds numeric,target_size_bytes integer,target_validation_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attachment public.message_attachments%rowtype; created public.messages%rowtype; canonical_path text; extension_start integer;
begin
  select * into attachment from public.message_attachments where id=target_attachment_id and uploader_id=target_actor_id for update;
  if attachment.id is null or attachment.deleted_at is not null or not messaging_private.active_account(target_actor_id)
    or not exists(select 1 from public.conversation_members where profile_id=target_actor_id and conversation_id=attachment.conversation_id) then
    raise exception 'Conversation inaccessible' using errcode='42501';
  end if;
  if attachment.status='ready' then
    select * into created from public.messages where id=attachment.message_id and deleted_at is null;
    if created.id is null then raise exception 'Média inaccessible' using errcode='42501'; end if;
    return jsonb_build_object('message',to_jsonb(created));
  end if;
  if attachment.status<>'pending' or attachment.created_at<clock_timestamp()-interval '2 hours' then raise exception 'Téléversement expiré'; end if;
  if target_validation_lease is null or attachment.validation_lease_id is distinct from target_validation_lease
    or attachment.validation_lease_until is null or attachment.validation_lease_until<=clock_timestamp() then
    raise exception 'Validation expirée. Réessayez cet envoi.' using errcode='42501';
  end if;
  extension_start:=length(attachment.storage_path)-position('.' in reverse(attachment.storage_path))+1;
  if extension_start<2 then raise exception 'Chemin de média invalide'; end if;
  canonical_path:=left(attachment.storage_path,extension_start-1)||'-validated.'||substring(attachment.storage_path from extension_start+1);
  perform set_config('app.message_enriched','true',true);
  insert into public.messages(conversation_id,sender_id,body,message_type,metadata,client_nonce)
    values(attachment.conversation_id,target_actor_id,case when attachment.mime_type='video/mp4' then 'Vidéo' else 'Photo' end,case when attachment.mime_type='video/mp4' then 'video' else 'image' end,jsonb_build_object('attachment_id',attachment.id),attachment.upload_nonce) returning * into created;
  update public.message_attachments set message_id=created.id,status='ready',width=target_width,height=target_height,duration_seconds=target_duration_seconds,size_bytes=target_size_bytes,
    storage_path=canonical_path,validation_lease_id=null,validation_lease_until=null where id=attachment.id;
  return jsonb_build_object('message',to_jsonb(created));
end $$;

revoke all on function public.claim_message_attachment_validation(uuid,uuid,uuid),public.complete_message_attachment(uuid,uuid,integer,integer,numeric,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_message_attachment_validation(uuid,uuid,uuid),public.complete_message_attachment(uuid,uuid,integer,integer,numeric,integer,uuid) to service_role;
notify pgrst,'reload schema';
commit;

