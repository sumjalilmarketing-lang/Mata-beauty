-- Internal triggers and commission helpers are not client API entrypoints.
do $$
declare target regprocedure;
begin
  for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and
    (p.prorettype='trigger'::regtype or p.proname in ('resolve_commission_breakdown','resolve_commission_breakdown_at'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated',target);
    execute format('grant execute on function %s to service_role',target);
  end loop;
  for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'admin_assign_role','admin_global_search','admin_list_users','admin_set_user_suspension',
      'admin_update_booking_status','admin_update_setting','get_admin_dashboard',
      'create_video_post','report_post_comment','write_admin_audit'
    )
  loop
    execute format('revoke all on function %s from public, anon',target);
    execute format('grant execute on function %s to authenticated, service_role',target);
  end loop;
end;
$$;

-- Reuse the same self/super-admin protection as the Users screen.
CREATE OR REPLACE FUNCTION public.manage_moderation_report(target_report_id uuid, target_action text, target_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_report public.reports%rowtype; current_post public.posts%rowtype; next_report text; next_post text;
begin
  if not public.has_admin_permission('reports.manage') then raise exception 'Permission reports.manage requise'; end if;
  if char_length(trim(coalesce(target_reason,'')))<2 then raise exception 'Motif requis'; end if;
  select * into current_report from public.reports where id=target_report_id for update;
  if current_report.id is null then raise exception 'Signalement introuvable'; end if;
  next_report:=current_report.status;
  if target_action='examine' then next_report:='reviewing';
  elsif target_action in ('warn','hide','restore') then
    if current_report.post_id is null then raise exception 'Aucun contenu associé'; end if;
    select * into current_post from public.posts where id=current_report.post_id for update;
    next_post:=case target_action when 'hide' then 'hidden' when 'restore' then 'published' else current_post.status end;
    update public.posts set status=next_post,updated_at=now() where id=current_post.id;
    insert into public.moderation_actions(actor_id,target_type,target_id,action,reason,previous_state,new_state) values(auth.uid(),'social_post',current_post.id,target_action,trim(target_reason),jsonb_build_object('status',current_post.status),jsonb_build_object('status',next_post));
    insert into public.notifications(profile_id,kind,title,body,data) values(current_post.author_id,'social_moderation','Décision de modération',case target_action when 'warn' then 'Votre publication a reçu un avertissement.' when 'hide' then 'Votre publication a été masquée.' else 'Votre publication a été restaurée.' end,jsonb_build_object('post_id',current_post.id,'decision',target_action));
  elsif target_action='suspend' then
    if not public.has_admin_permission('users.suspend') or current_report.reported_profile_id is null then raise exception 'Permission users.suspend requise'; end if;
    perform public.admin_set_user_suspension(current_report.reported_profile_id,true,target_reason);
  elsif target_action='close' then next_report:='resolved';
  else raise exception 'Action de modération invalide'; end if;
  update public.reports set status=next_report,assigned_to=auth.uid(),resolved_at=case when next_report='resolved' then now() else null end where id=target_report_id;
  perform public.write_admin_audit('moderation.report.'||target_action,'reports',target_report_id,to_jsonb(current_report),jsonb_build_object('status',next_report,'post_status',next_post),target_reason);
  return jsonb_build_object('id',target_report_id,'status',next_report,'post_status',next_post);
end; $function$
;
