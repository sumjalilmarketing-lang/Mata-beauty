begin;
do $migration$
declare definition text;
begin
 select pg_get_viewdef('public.social_feed'::regclass,true) into definition;
 if position('pr.avatar_url' in definition)=0 then raise exception 'Unexpected feed definition';end if;
 execute 'create or replace view public.social_feed as '||replace(definition,'pr.avatar_url','coalesce(pp.logo_url, pr.avatar_url) as avatar_url');
 select pg_get_functiondef('public.respond_business_invitation(text)'::regprocedure) into definition;
 if position('if auth.uid()=invitation.invited_by or not exists' in definition)=0 then raise exception 'Unexpected invitation definition';end if;
 definition:=replace(definition,'if auth.uid()=invitation.invited_by or not exists','if auth.uid()=invitation.invited_by then return jsonb_build_object(''state'',''owner''); end if; if not exists');
 execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;
