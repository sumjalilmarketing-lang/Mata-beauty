begin;
set local lock_timeout='5s';
create index commercial_field_team_actor_time on public.commercial_field_events(team_id,actor_id,created_at desc,id);
create function public.commercial_team_positions(target_team uuid,target_offset integer default 0)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.department_can_manage(target_team)or not exists(select 1 from public.department_teams where id=target_team and department='commercial')then raise exception 'Responsable commercial de cette équipe requis' using errcode='42501';end if;
 if target_offset is null or target_offset<0 or target_offset>100000 then raise exception 'Page invalide';end if;
 select jsonb_build_object('total',(select count(*)from public.department_team_members where team_id=target_team),'agents',coalesce(jsonb_agg(x order by x.display_name,x.user_id),'[]'))into result from(
 select m.user_id,coalesce(p.display_name,'Commercial')display_name,m.status,
 (select to_jsonb(e)from public.commercial_field_events e where e.team_id=target_team and e.actor_id=m.user_id order by e.created_at desc,e.id desc limit 1)last_event,
 (select jsonb_build_object('latitude',e.latitude,'longitude',e.longitude,'accuracy',e.accuracy,'created_at',e.created_at,'place',e.place)from public.commercial_field_events e where e.team_id=target_team and e.actor_id=m.user_id and e.geo_status='available'order by e.created_at desc,e.id desc limit 1)last_position,
 exists(select 1 from public.commercial_field_events e where e.team_id=target_team and e.actor_id=m.user_id and e.action='shift_start'and not exists(select 1 from public.commercial_field_events z where z.session_id=e.session_id and z.action='shift_end'))day_open
 from public.department_team_members m join public.profiles p on p.id=m.user_id where m.team_id=target_team order by p.display_name,m.user_id limit 50 offset target_offset)x;
 return result;
end;$$;
revoke all on function public.commercial_team_positions(uuid,integer)from public,anon;
grant execute on function public.commercial_team_positions(uuid,integer)to authenticated;
commit;
