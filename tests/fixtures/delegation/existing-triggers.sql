CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  identity_verified boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role and old.id = auth.uid() then
    raise exception 'Impossible de modifier son propre rôle';
  end if;
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'Le changement de rôle nécessite un Super Admin';
  end if;
  if new.is_suspended is distinct from old.is_suspended
    and not public.has_admin_permission('users.suspend')
  then
    raise exception 'Permission users.suspend requise';
  end if;

  if new.account_status is distinct from old.account_status then
    if old.account_status = 'email_unverified' and new.account_status = 'active' then
      select email_confirmed_at is not null into identity_verified from auth.users where id = old.id;
    elsif old.account_status = 'phone_unverified' and new.account_status = 'active' then
      select phone_confirmed_at is not null into identity_verified from auth.users where id = old.id;
    end if;
    if not identity_verified then
      raise exception 'Transition de compte interdite ou identité non vérifiée';
    end if;
  end if;

  if (old.terms_accepted_at is not null and new.terms_accepted_at is distinct from old.terms_accepted_at)
    or (old.privacy_accepted_at is not null and new.privacy_accepted_at is distinct from old.privacy_accepted_at)
  then
    raise exception 'Les consentements légaux sont immuables';
  end if;

  return new;
end;
$function$
;
CREATE TRIGGER profiles_protect_privileges BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_privileges();
CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if old.role is distinct from new.role and old.id = auth.uid() then
    raise exception 'Impossible de modifier son propre rôle';
  end if;
  if old.role is distinct from new.role and not public.is_super_admin() then
    raise exception 'Le rôle ne peut être modifié que par un Super Admin';
  end if;
  if old.is_suspended is distinct from new.is_suspended
    and not public.has_admin_permission('users.suspend')
  then
    raise exception 'Permission users.suspend requise';
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER profiles_protect_security_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_security_fields();
CREATE OR REPLACE FUNCTION public.protect_provider_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt()->>'role','')='service_role'
    or coalesce(current_setting('request.jwt.claim.role',true),'')='service_role'
    or coalesce(current_setting('mata.rating_refresh',true),'')='trusted'
    or public.has_admin_permission('providers.verify') or public.has_admin_permission('providers.suspend') then return new; end if;
  if tg_op='INSERT' then
    if new.status<>'draft' or new.verified_at is not null then raise exception 'Un nouveau profil doit être un brouillon'; end if;
  elsif new.status is distinct from old.status or new.verified_at is distinct from old.verified_at or new.average_rating is distinct from old.average_rating or new.review_count is distinct from old.review_count then
    if current_user='postgres' and current_setting('mata.application_submit',true)=new.profile_id::text
      and auth.uid()=new.profile_id and new.status='pending_review' and old.status in ('draft','rejected')
      and new.verified_at is not distinct from old.verified_at and new.average_rating is not distinct from old.average_rating and new.review_count is not distinct from old.review_count then return new; end if;
    raise exception 'La validation professionnelle est réservée au serveur';
  end if;
  return new;
end; $function$
;
CREATE TRIGGER providers_protect_review_fields BEFORE INSERT OR UPDATE ON public.provider_profiles FOR EACH ROW EXECUTE FUNCTION protect_provider_review_fields();
CREATE OR REPLACE FUNCTION public.protect_document_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt()->>'role','')='service_role' or public.has_admin_permission('documents.review') then return new; end if;
  if new.provider_id<>auth.uid() or new.kind not in ('identity','business_registration','qualification','address_proof')
    or split_part(new.storage_path,'/',1)<>auth.uid()::text
    or not exists(select 1 from storage.objects where bucket_id='provider-documents' and name=new.storage_path) then raise exception 'Document privé invalide'; end if;
  if tg_op='INSERT' then
    new.status:='pending'; new.rejection_reason:=null; new.reviewed_by:=null; new.reviewed_at:=null;
  elsif new.status is distinct from old.status or new.rejection_reason is distinct from old.rejection_reason or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
    or new.storage_path is distinct from old.storage_path or new.kind is distinct from old.kind or new.provider_id is distinct from old.provider_id then
    raise exception 'Envoyez un nouveau document pour demander sa vérification';
  end if;
  return new;
end; $function$
;
CREATE TRIGGER documents_protect_review_fields BEFORE INSERT OR UPDATE ON public.provider_documents FOR EACH ROW EXECUTE FUNCTION protect_document_review_fields();
