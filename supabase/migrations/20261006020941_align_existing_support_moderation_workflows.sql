-- Align existing production support APIs in all environments.
create table if not exists public.support_ticket_events (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 action text not null check (action in ('opened','assigned','replied','priority_changed','pending','escalated','resolved','reopened')),
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.support_ticket_events enable row level security;
revoke all on public.support_ticket_events from anon, authenticated;
grant select on public.support_ticket_events to authenticated;
grant all on public.support_ticket_events to service_role;
drop policy if exists "support ticket events scoped read" on public.support_ticket_events;
create policy "support ticket events scoped read" on public.support_ticket_events for select to authenticated
using (exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.requester_id=auth.uid() or public.has_admin_permission('support.manage'))));

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
CREATE OR REPLACE FUNCTION public.manage_support_ticket(target_ticket_id uuid, target_action text, target_value text DEFAULT NULL::text, target_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_ticket public.support_tickets%rowtype; next_status text; next_priority text; next_assignee uuid;
begin
  select * into current_ticket from public.support_tickets where id=target_ticket_id for update;
  if current_ticket.id is null then raise exception 'Ticket introuvable'; end if;
  if auth.uid() is null or (current_ticket.requester_id<>auth.uid() and not public.has_admin_permission('support.manage')) then raise exception 'Accès refusé'; end if;
  next_status:=current_ticket.status; next_priority:=current_ticket.priority; next_assignee:=current_ticket.assigned_to;
  if target_action='reply' then
    if nullif(trim(target_message),'') is null then raise exception 'Réponse requise'; end if;
    insert into public.support_messages(ticket_id,sender_id,body,is_internal) values(target_ticket_id,auth.uid(),trim(target_message),false);
  elsif target_action='reopen' and current_ticket.requester_id=auth.uid() and current_ticket.status in ('resolved','closed') then next_status:='open';
  elsif not public.has_admin_permission('support.manage') then raise exception 'Permission support.manage requise';
  elsif target_action='assign' then next_assignee:=coalesce(nullif(target_value,'')::uuid,auth.uid());
  elsif target_action='priority' and target_value in ('low','normal','high','urgent') then next_priority:=target_value;
  elsif target_action='pending' then next_status:='pending';
  elsif target_action='escalate' then next_status:='pending'; next_priority:='urgent';
  elsif target_action='resolve' then next_status:='resolved';
  elsif target_action='reopen' then next_status:='open';
  else raise exception 'Transition support invalide'; end if;
  update public.support_tickets set status=next_status,priority=next_priority,assigned_to=next_assignee,updated_at=now() where id=target_ticket_id;
  insert into public.support_ticket_events(ticket_id,actor_id,action,details) values(target_ticket_id,auth.uid(),case target_action when 'reply' then 'replied' when 'priority' then 'priority_changed' when 'pending' then 'pending' when 'escalate' then 'escalated' when 'resolve' then 'resolved' when 'reopen' then 'reopened' else 'assigned' end,jsonb_build_object('value',target_value,'message',case when target_message is null then null else left(target_message,200) end));
  if public.is_admin() then perform public.write_admin_audit('support.ticket.'||target_action,'support_tickets',target_ticket_id,to_jsonb(current_ticket),jsonb_build_object('status',next_status,'priority',next_priority,'assigned_to',next_assignee),coalesce(nullif(trim(target_message),''),target_value,'Action support')); end if;
  return jsonb_build_object('id',target_ticket_id,'status',next_status,'priority',next_priority,'assigned_to',next_assignee);
end; $function$
;
revoke all on function public.manage_support_ticket(uuid,text,text,text), public.manage_moderation_report(uuid,text,text) from public,anon;
grant execute on function public.manage_support_ticket(uuid,text,text,text), public.manage_moderation_report(uuid,text,text) to authenticated,service_role;
