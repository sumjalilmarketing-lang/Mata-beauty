begin;
create function public.hr_leave_balance(target_employee uuid,target_year integer)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare quota numeric;used numeric;
begin
 if not public.hr_employee_access(target_employee)then raise exception 'Dossier RH inaccessible'using errcode='42501';end if;
 if target_year is null or target_year not between 1900 and 2100 then raise exception 'Année invalide';end if;
 select annual_leave_days into quota from public.hr_employees where id=target_employee;
 select coalesce(sum((data->>'days')::numeric),0)into used from public.hr_items where employee_id=target_employee and kind='leave'and state='approved'and data->>'leave_type'='annual'and extract(year from(data->>'start_on')::date)=target_year;
 return jsonb_build_object('year',target_year,'quota',quota,'used',used,'remaining',quota-used);
end;$$;
revoke all on function public.hr_leave_balance(uuid,integer)from public,anon;
grant execute on function public.hr_leave_balance(uuid,integer)to authenticated;
commit;
