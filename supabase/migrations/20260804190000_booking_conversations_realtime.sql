-- Messagerie privée liée aux rendez-vous, avec création atomique et accusés de lecture.

create unique index if not exists conversations_booking_unique_idx
  on public.conversations(booking_id)
  where booking_id is not null;

create or replace function public.ensure_booking_conversation(target_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_booking public.bookings%rowtype;
  selected_conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select * into selected_booking
  from public.bookings
  where id = target_booking_id;

  if not found or auth.uid() not in (selected_booking.client_id, selected_booking.provider_id) then
    raise exception 'Réservation inaccessible';
  end if;

  insert into public.conversations (booking_id)
  values (target_booking_id)
  on conflict (booking_id) where booking_id is not null do nothing;

  select id into selected_conversation_id
  from public.conversations
  where booking_id = target_booking_id;

  insert into public.conversation_members (conversation_id, profile_id, last_read_at)
  values
    (selected_conversation_id, selected_booking.client_id, now()),
    (selected_conversation_id, selected_booking.provider_id, now())
  on conflict (conversation_id, profile_id) do nothing;

  return selected_conversation_id;
end;
$$;

revoke all on function public.ensure_booking_conversation(uuid) from public, anon;
grant execute on function public.ensure_booking_conversation(uuid) to authenticated;

create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  read_time timestamptz := now();
begin
  update public.conversation_members
  set last_read_at = read_time
  where conversation_id = target_conversation_id
    and profile_id = auth.uid();

  if not found then
    raise exception 'Conversation inaccessible';
  end if;

  return read_time;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_conversation_on_message() from public, anon, authenticated;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_on_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end;
$$;

comment on function public.ensure_booking_conversation(uuid) is
  'Crée ou retourne la conversation privée d un rendez-vous pour ses deux participants.';
comment on function public.mark_conversation_read(uuid) is
  'Met à jour l accusé de lecture du membre connecté sans pouvoir modifier celui d un tiers.';
