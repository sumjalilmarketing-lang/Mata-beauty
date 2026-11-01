-- Preserve service ownership even when the linking table is mutated directly.
create or replace function public.guard_post_service_owner()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; service_owner uuid;
begin
 select author_id into owner_id from public.posts where id=new.post_id;
 select provider_id into service_owner from public.provider_services where id=new.provider_service_id;
 if owner_id is null or service_owner is distinct from owner_id then
  raise exception 'La prestation doit appartenir au professionnel de la publication' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_post_service_owner() from public,anon,authenticated;
drop trigger if exists post_service_owner_guard on public.post_services;
create trigger post_service_owner_guard before insert or update on public.post_services
for each row execute function public.guard_post_service_owner();

-- Deferred: existing publication RPCs may replace links in one transaction.
-- Deleting a post cascades its links; absent posts require no surviving link.
create or replace function public.guard_post_primary_service()
returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[]; target uuid; publication record;
begin
 if tg_op='INSERT' then ids:=array[new.post_id];
 elsif tg_op='DELETE' then ids:=array[old.post_id];
 else ids:=array[old.post_id,new.post_id]; end if;
 foreach target in array ids loop
  select id,author_id,status into publication from public.posts where id=target for update;
  if found and publication.status in ('published','scheduled') and not exists(
   select 1 from public.post_services ps join public.provider_services s on s.id=ps.provider_service_id
   where ps.post_id=target and ps.is_primary and s.provider_id=publication.author_id and s.is_active
  ) then raise exception 'Une prestation principale active est obligatoire pour la publication' using errcode='23514'; end if;
 end loop;
 return null;
end;
$$;
revoke all on function public.guard_post_primary_service() from public,anon,authenticated;
drop trigger if exists post_primary_service_guard on public.post_services;
create constraint trigger post_primary_service_guard after insert or update or delete on public.post_services
deferrable initially deferred for each row execute function public.guard_post_primary_service();

create or replace function public.protect_post_comment_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')='service_role' then return new; end if;
 if tg_op='INSERT' then
  new.is_hidden:=false;
  if new.parent_id is not null and not exists(
   select 1 from public.post_comments parent where parent.id=new.parent_id and parent.post_id=new.post_id
  ) then raise exception 'La réponse doit appartenir à la même publication' using errcode='23514'; end if;
  return new;
 end if;
 if row(old.id,old.author_id,old.post_id,old.parent_id,old.created_at)
  is distinct from row(new.id,new.author_id,new.post_id,new.parent_id,new.created_at)
 then raise exception 'L’identité et la publication du commentaire sont immuables' using errcode='42501'; end if;
 if old.body is distinct from new.body and old.author_id is distinct from auth.uid()
 then raise exception 'Seul l’auteur peut modifier son texte' using errcode='42501'; end if;
 if old.is_hidden is distinct from new.is_hidden and not public.has_admin_permission('reviews.moderate')
 then raise exception 'Permission de modération requise' using errcode='42501'; end if;
 return new;
end;
$$;
revoke all on function public.protect_post_comment_fields() from public,anon,authenticated;
drop trigger if exists post_comment_fields_guard on public.post_comments;
create trigger post_comment_fields_guard before insert or update on public.post_comments
for each row execute function public.protect_post_comment_fields();

drop policy if exists "visible comments public read" on public.post_comments;
create policy "visible comments public read" on public.post_comments for select
using (
 public.has_admin_permission('reviews.moderate')
 or (not is_hidden and exists(select 1 from public.posts p where p.id=post_comments.post_id and p.status='published'))
);
