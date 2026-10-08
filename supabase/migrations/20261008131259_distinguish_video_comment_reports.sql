-- Keep duplicate protection separately for a video and for each comment.
drop index public.reports_one_open_post_reporter_idx;
create unique index reports_one_open_post_reporter_idx on public.reports(reporter_id,post_id)
where post_id is not null and comment_id is null and status in ('open','reviewing');
create or replace function public.report_social_post(target_post_id uuid, target_reason text, target_details text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if target_reason not in ('contenu_inapproprie','spam','fausse_prestation','escroquerie','contenu_vole','harcelement','faux_resultat','autre')
    then raise exception 'Motif de signalement invalide'; end if;
  if not exists(select 1 from public.posts where id=target_post_id and status='published') then raise exception 'Publication introuvable'; end if;
  select id into result_id from public.reports where reporter_id=auth.uid() and post_id=target_post_id and comment_id is null and status in ('open','reviewing') limit 1;
  if result_id is null then
    insert into public.reports(reporter_id,post_id,reported_profile_id,reason,details)
    select auth.uid(),p.id,p.author_id,target_reason,nullif(trim(target_details),'') from public.posts p where p.id=target_post_id
    returning id into result_id;
  end if;
  return result_id;
end; $$;
CREATE OR REPLACE FUNCTION public.manage_moderation_report(target_report_id uuid, target_action text, target_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_report public.reports%rowtype; current_post public.posts%rowtype; next_report text; next_post text; current_comment public.post_comments%rowtype;
begin
  if not public.has_admin_permission('reports.manage') then raise exception 'Permission reports.manage requise'; end if;
  if char_length(trim(coalesce(target_reason,'')))<2 then raise exception 'Motif requis'; end if;
  select * into current_report from public.reports where id=target_report_id for update;
  if current_report.id is null then raise exception 'Signalement introuvable'; end if;
  next_report:=current_report.status;
  if target_action='examine' then next_report:='reviewing';
  elsif target_action in ('warn','hide','restore') and current_report.comment_id is not null then
    if not public.has_admin_permission('reviews.moderate') then raise exception 'Permission reviews.moderate requise'; end if;
    select * into current_comment from public.post_comments where id=current_report.comment_id for update;
    if current_comment.id is null then raise exception 'Commentaire introuvable'; end if;
    if target_action in ('hide','restore') then
      update public.post_comments set is_hidden=(target_action='hide') where id=current_comment.id;
    end if;
    insert into public.notifications(profile_id,kind,title,body,data)
    values(current_comment.author_id,'social_moderation','Décision de modération',
      case target_action when 'warn' then 'Votre commentaire a reçu un avertissement.' when 'hide' then 'Votre commentaire a été masqué.' else 'Votre commentaire a été restauré.' end,
      jsonb_build_object('post_id',current_comment.post_id,'comment_id',current_comment.id,'decision',target_action));
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
