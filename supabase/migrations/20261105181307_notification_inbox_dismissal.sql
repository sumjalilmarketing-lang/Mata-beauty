alter table public.notifications add column if not exists dismissed_at timestamptz;
create or replace function public.set_notification_dismissed(target_id uuid, dismissed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or dismissed is null or not exists(select 1 from public.profiles where id=auth.uid() and account_status='active' and not is_suspended) then raise exception 'Accès refusé' using errcode='42501'; end if;
 update public.notifications set dismissed_at=case when dismissed then now() else null end,read_at=case when dismissed then coalesce(read_at,now()) else read_at end where id=target_id and profile_id=auth.uid();
 if not found then raise exception 'Notification inaccessible' using errcode='42501'; end if;
 return true;
end $$;
revoke all on function public.set_notification_dismissed(uuid,boolean) from public,anon;
grant execute on function public.set_notification_dismissed(uuid,boolean) to authenticated;
create or replace function public.get_notification_actors(target_ids uuid[])
returns table(notification_id uuid,actor_name text)
language sql stable security definer set search_path='' as $$
 select n.id,coalesce(nullif(p.display_name,''),'Mata Beauty')
 from public.notifications n
 left join public.messages m on m.id::text=n.data->>'message_id' and m.conversation_id::text=n.data->>'conversation_id'
 left join public.bookings b on b.id::text=n.data->>'booking_id'
 left join public.profiles p on p.id::text=coalesce(m.sender_id::text,n.data->>'actor_id',case when n.profile_id=b.client_id then b.provider_id::text else b.client_id::text end)
 where n.id=any(target_ids) and n.profile_id=auth.uid() and cardinality(target_ids)<=200
 and exists(select 1 from public.profiles actor where actor.id=auth.uid() and actor.account_status='active' and not actor.is_suspended);
$$;
revoke all on function public.get_notification_actors(uuid[]) from public,anon;
grant execute on function public.get_notification_actors(uuid[]) to authenticated;
notify pgrst,'reload schema';
