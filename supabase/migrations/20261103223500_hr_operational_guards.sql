begin;
set local lock_timeout='5s';
alter table public.hr_employees add constraint hr_employee_finite_dates check(hired_on between date '1900-01-01'and date '2100-12-31'and(left_on is null or left_on between date '1900-01-01'and date '2100-12-31')and(status<>'left'or left_on is not null));
do $$declare source text;begin
 source:=pg_get_functiondef('public.hr_save_employee(uuid,integer,uuid,uuid,jsonb,text)'::regprocedure);
 if position($match$linked:=nullif(person->>'profile_id','')::uuid;$match$in source)=0 then raise exception 'Fiche RH inattendue';end if;
 execute replace(source,$match$linked:=nullif(person->>'profile_id','')::uuid;$match$,$replacement$linked:=nullif(person->>'profile_id','')::uuid;
 if linked is null and nullif(trim(person->>'email'),'')is not null then
 select u.id into linked from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=lower(trim(person->>'email'))and u.email_confirmed_at is not null and p.account_status='active'and not p.is_suspended;
 end if;$replacement$);
end$$;
do $$begin
 if exists(select 1 from storage.buckets where id='hr-documents'and(public is distinct from false or file_size_limit is distinct from 10485760::bigint or allowed_mime_types is distinct from array['application/pdf','image/jpeg','image/png']))then raise exception 'Configuration du coffre RH incompatible';end if;
end$$;
create function public.hr_record_export(target_item uuid)returns void language plpgsql security definer set search_path='' as $$
declare item public.hr_items;
begin
 select * into item from public.hr_items where id=target_item;
 if not found or item.kind<>'payroll'or not public.hr_item_access(item.employee_id,item.kind,item.data)then raise exception 'Export de paie refusé'using errcode='42501';end if;
 insert into public.hr_events(employee_id,item_id,actor_id,action,note)values(item.employee_id,item.id,auth.uid(),'payroll.exported','Export de la fiche de paie CSV demandé par un utilisateur habilité');
end;$$;
revoke all on function public.hr_record_export(uuid)from public,anon;
grant execute on function public.hr_record_export(uuid)to authenticated;
commit;
