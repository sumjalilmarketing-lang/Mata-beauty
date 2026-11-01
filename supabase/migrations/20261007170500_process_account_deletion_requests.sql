-- Complete the existing request queue without pretending that retained records are erased.
revoke insert, update, delete on public.account_deletion_requests from anon, authenticated;

create or replace function public.request_account_deletion(target_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  perform 1 from public.profiles where id=auth.uid() and not is_suspended for update;
  if not found then raise exception 'Compte indisponible'; end if;
  if exists(select 1 from public.admin_user_roles where user_id=auth.uid()) then
    raise exception 'Les accès internes doivent être traités dans Équipe et accès';
  end if;
  select id into result_id from public.account_deletion_requests
    where profile_id=auth.uid() and status in ('requested','reviewing','approved')
    order by requested_at limit 1;
  if result_id is not null then return result_id; end if;
  if length(coalesce(target_reason,''))>1000 then raise exception 'Motif trop long'; end if;
  if exists(select 1 from public.bookings where (client_id=auth.uid() or provider_id=auth.uid())
    and status in ('pending','confirmed','in_progress')) then
    raise exception 'Annulez ou terminez vos rendez-vous actifs avant cette demande';
  end if;
  if exists(select 1 from public.payments where (customer_id=auth.uid() or professional_id=auth.uid())
    and payment_status='pending') then raise exception 'Un paiement doit être traité avant cette demande'; end if;
  insert into public.account_deletion_requests(profile_id,reason)
    values(auth.uid(),nullif(trim(target_reason),'')) returning id into result_id;
  insert into public.user_activity_history(profile_id,action,metadata)
    values(auth.uid(),'account.deletion_requested',jsonb_build_object('request_id',result_id));
  return result_id;
end; $$;
revoke all on function public.request_account_deletion(text) from public,anon;
grant execute on function public.request_account_deletion(text) to authenticated;

create or replace function public.admin_begin_account_deletion(target_request_id uuid, target_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request_row public.account_deletion_requests%rowtype;
begin
  perform public.require_team_manager();
  if not public.has_admin_permission('users.delete') then raise exception 'Permission users.delete requise'; end if;
  if length(trim(coalesce(target_reason,''))) not between 5 and 1000 then raise exception 'Note de traitement requise'; end if;
  select * into request_row from public.account_deletion_requests where id=target_request_id for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if request_row.profile_id=auth.uid() or exists(select 1 from public.admin_user_roles where user_id=request_row.profile_id)
    then raise exception 'Traitement des comptes internes interdit depuis cette file'; end if;
  if request_row.status='reviewing' then return jsonb_build_object('status','reviewing','idempotent',true); end if;
  if request_row.status<>'requested' then raise exception 'Demande non disponible'; end if;
  perform 1 from public.profiles where id=request_row.profile_id for update;
  if exists(select 1 from public.bookings where (client_id=request_row.profile_id or provider_id=request_row.profile_id)
    and status in ('pending','confirmed','in_progress')) then raise exception 'Rendez-vous actifs à traiter avant désactivation'; end if;
  update public.profiles set is_suspended=true,updated_at=now() where id=request_row.profile_id;
  update auth.users set banned_until=now()+interval '100 years' where id=request_row.profile_id;
  delete from auth.sessions where user_id=request_row.profile_id;
  update public.account_deletion_requests set status='reviewing',processed_at=null where id=request_row.id;
  perform public.write_admin_audit('account.deletion_review_started','account_deletion_requests',request_row.id,
    jsonb_build_object('status',request_row.status),jsonb_build_object('status','reviewing','account_disabled',true,'erased',false),target_reason);
  return jsonb_build_object('status','reviewing','account_disabled',true,'erased',false);
end; $$;
revoke all on function public.admin_begin_account_deletion(uuid,text) from public,anon;
grant execute on function public.admin_begin_account_deletion(uuid,text) to authenticated;
