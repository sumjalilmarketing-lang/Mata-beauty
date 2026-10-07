create or replace function public.audit_comment_visibility_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.is_hidden is distinct from new.is_hidden
    and coalesce(auth.jwt()->>'role','')<>'service_role' then
  perform public.write_admin_audit(
   case when new.is_hidden then 'comment.hidden' else 'comment.restored' end,
   'post_comment',new.id,
   jsonb_build_object('is_hidden',old.is_hidden),
   jsonb_build_object('is_hidden',new.is_hidden),
   'Décision de modération de commentaire'
  );
 end if;
 return new;
end;
$$;
revoke all on function public.audit_comment_visibility_change() from public,anon,authenticated;
drop trigger if exists comment_visibility_audit on public.post_comments;
create trigger comment_visibility_audit after update of is_hidden on public.post_comments
for each row execute function public.audit_comment_visibility_change();
