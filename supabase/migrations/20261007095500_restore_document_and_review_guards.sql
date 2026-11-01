-- The document guard existed as a function but had no trigger in production.
drop trigger if exists documents_protect_review_fields on public.provider_documents;
create trigger documents_protect_review_fields before insert or update on public.provider_documents
for each row execute function public.protect_document_review_fields();

create or replace function public.protect_review_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role','')='service_role' then return new; end if;
  if auth.uid() is null then raise exception 'Authentification requise' using errcode='42501'; end if;
  if tg_op='INSERT' then
    if new.client_id is distinct from auth.uid() or not exists(
      select 1 from public.bookings b where b.id=new.booking_id and b.client_id=auth.uid()
        and b.provider_id=new.provider_id and b.status='completed'
    ) then raise exception 'Réservation terminée correspondante requise' using errcode='42501'; end if;
    new.provider_reply:=null;
    new.is_visible:=true;
    return new;
  end if;
  if new.id is distinct from old.id or new.booking_id is distinct from old.booking_id
    or new.client_id is distinct from old.client_id or new.provider_id is distinct from old.provider_id
    or new.created_at is distinct from old.created_at
  then raise exception 'Identité de l’avis immuable' using errcode='42501'; end if;
  if new.rating is distinct from old.rating or new.comment is distinct from old.comment then
    if auth.uid()<>old.client_id then raise exception 'Seul le client peut modifier son avis' using errcode='42501'; end if;
  end if;
  if new.provider_reply is distinct from old.provider_reply and auth.uid()<>old.provider_id
  then raise exception 'Réponse réservée au professionnel' using errcode='42501'; end if;
  if new.is_visible is distinct from old.is_visible and not public.has_admin_permission('reviews.moderate')
  then raise exception 'Modération réservée aux agents autorisés' using errcode='42501'; end if;
  return new;
end; $$;
revoke all on function public.protect_review_fields() from public,anon,authenticated;
drop trigger if exists reviews_protect_fields on public.reviews;
create trigger reviews_protect_fields before insert or update on public.reviews
for each row execute function public.protect_review_fields();

alter policy "completed client review" on public.reviews with check (
  client_id=auth.uid() and exists(select 1 from public.bookings b
    where b.id=reviews.booking_id and b.client_id=auth.uid()
      and b.provider_id=reviews.provider_id and b.status='completed')
);
