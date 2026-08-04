-- Répare explicitement le trigger de notification des messages sur les projets ayant dérivé.

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (profile_id, kind, title, body, data)
  select
    member.profile_id,
    'message_created',
    'Nouveau message',
    'Vous avez reçu un nouveau message.',
    jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
  from public.conversation_members member
  where member.conversation_id = new.conversation_id
    and member.profile_id <> new.sender_id;

  return new;
end;
$$;

revoke all on function public.notify_new_message() from public, anon, authenticated;

drop trigger if exists messages_notify_created on public.messages;
create trigger messages_notify_created
after insert on public.messages
for each row execute function public.notify_new_message();

comment on function public.notify_new_message() is
  'Crée une notification privée pour chaque autre membre après l insertion d un message.';
