-- Direct table writes must never decide professional approval. Authorized RPCs
-- execute as their owner; the trigger deliberately retains SECURITY INVOKER.
create or replace function public.guard_provider_trust_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then
      if new.status <> 'draft' or new.verified_at is not null or new.average_rating <> 0 or new.review_count <> 0 then
        raise exception 'La validation professionnelle est réservée à l’équipe habilitée' using errcode='42501';
      end if;
    elsif new.status is distinct from old.status
       or new.verified_at is distinct from old.verified_at
       or new.average_rating is distinct from old.average_rating
       or new.review_count is distinct from old.review_count
       or new.profile_id is distinct from old.profile_id then
      raise exception 'Les champs de validation ne sont pas modifiables directement' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_provider_trust_fields() from public,anon,authenticated;
create trigger guard_provider_trust_fields before insert or update on public.provider_profiles
for each row execute function public.guard_provider_trust_fields();

-- Central gate used by both SECURITY DEFINER RPCs and RLS helpers.
create or replace function public.admin_mfa_required()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.admin_user_roles m join public.admin_roles r on r.id=m.role_id
 join public.profiles p on p.id=m.user_id
 where m.user_id=auth.uid() and p.role='admin' and not p.is_suspended
 and m.is_active and m.revoked_at is null and r.is_active and m.requires_mfa)
 and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2';
$$;
revoke all on function public.admin_mfa_required() from public,anon;
grant execute on function public.admin_mfa_required() to authenticated,service_role;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select not public.admin_mfa_required() and exists(select 1 from public.profiles
 where id=auth.uid() and role='admin' and not is_suspended);
$$;
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select not public.admin_mfa_required() and exists(select 1 from public.profiles p
 join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id
 where p.id=auth.uid() and p.role='admin' and not p.is_suspended and m.is_active
 and m.revoked_at is null and r.is_active and r.key='super_admin');
$$;
create or replace function public.has_admin_permission(required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
 select not public.admin_mfa_required() and exists(select 1 from public.profiles p
 join public.admin_user_roles m on m.user_id=p.id join public.admin_roles r on r.id=m.role_id
 left join public.admin_role_permissions rp on rp.role_id=r.id
 where p.id=auth.uid() and p.role='admin' and not p.is_suspended and m.is_active
 and m.revoked_at is null and r.is_active and (r.key='super_admin' or rp.permission_key=required_permission));
$$;
-- Keep the current context shape, returning no privileged context before MFA.
-- The UI calls admin_mfa_required separately to offer the second-factor step.
