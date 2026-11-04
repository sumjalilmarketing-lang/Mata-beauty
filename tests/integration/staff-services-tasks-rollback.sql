-- Synthetic fixtures only; every write is rolled back. No real invitations sent.
begin;
-- Privileged fixture setup only. Reset before every application authorization check.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.cw_owner',gen_random_uuid()::text,true),set_config('test.cw_staff',gen_random_uuid()::text,true),set_config('test.cw_other',gen_random_uuid()::text,true),set_config('test.cw_client',gen_random_uuid()::text,true),set_config('test.cw_business',gen_random_uuid()::text,true),set_config('test.cw_service',gen_random_uuid()::text,true),set_config('test.cw_employee',gen_random_uuid()::text,true),set_config('test.cw_colleague',gen_random_uuid()::text,true),set_config('test.cw_colleague_account',gen_random_uuid()::text,true),set_config('test.cw_start',((current_date+7)::timestamp+interval '12 hours')::timestamptz::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) select current_setting(k)::uuid,'collab-qa-'||current_setting(k)||'@example.invalid',now(),'{"qa_suppress_email":true}','{"display_name":"Collaborator QA"}' from(values('test.cw_owner'),('test.cw_staff'),('test.cw_other'),('test.cw_client'),('test.cw_colleague_account'))t(k);
insert into public.profiles(id,display_name) select current_setting(k)::uuid,'Collaborator QA' from(values('test.cw_owner'),('test.cw_staff'),('test.cw_other'),('test.cw_client'),('test.cw_colleague_account'))t(k) on conflict(id)do nothing;
insert into public.provider_profiles(profile_id,business_name,slug,status,timezone,country_code,currency) values(current_setting('test.cw_owner')::uuid,'Collaborator QA','cw-'||current_setting('test.cw_owner'),'approved','Africa/Dakar','SN','XOF');
insert into public.businesses(id,owner_id,name,slug,address,city,status,timezone,country_code,currency) values(current_setting('test.cw_business')::uuid,current_setting('test.cw_owner')::uuid,'Salon collaborateurs QA','cw-'||current_setting('test.cw_business'),'QA','Dakar','approved','Africa/Dakar','SN','XOF');
insert into public.provider_services(id,provider_id,business_id,service_id,title,duration_minutes,price_amount,currency,is_active) select current_setting('test.cw_service')::uuid,current_setting('test.cw_owner')::uuid,current_setting('test.cw_business')::uuid,id,'Tresses QA collaborateurs',60,10000,'XOF',true from public.services where is_active limit 1;
insert into public.collaborators(id,business_id,display_name,is_active,is_bookable) values(current_setting('test.cw_employee')::uuid,current_setting('test.cw_business')::uuid,'Aïda QA',true,true),(current_setting('test.cw_colleague')::uuid,current_setting('test.cw_business')::uuid,'Collègue QA',true,true);
update public.collaborators set profile_id=current_setting('test.cw_colleague_account')::uuid where id=current_setting('test.cw_colleague')::uuid;
insert into booking_private.collaborator_access(collaborator_id,business_id,profile_id,internal_role,permissions,granted_by) values(current_setting('test.cw_colleague')::uuid,current_setting('test.cw_business')::uuid,current_setting('test.cw_colleague_account')::uuid,'member',array['bookings.read','bookings.manage'],current_setting('test.cw_owner')::uuid);
insert into public.collaborator_services(collaborator_id,provider_service_id) values(current_setting('test.cw_employee')::uuid,current_setting('test.cw_service')::uuid),(current_setting('test.cw_colleague')::uuid,current_setting('test.cw_service')::uuid);
insert into public.collaborator_hours(collaborator_id,weekday,starts_at,ends_at) select current_setting(k)::uuid,extract(dow from current_setting('test.cw_start')::timestamptz),'10:00','22:00' from(values('test.cw_employee'),('test.cw_colleague'))t(k);
update public.businesses set team_booking_enabled=true where id=current_setting('test.cw_business')::uuid;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cw_owner'),'role','authenticated')::text,true);
select set_config('test.cw_invite',public.create_member_phone_invitation(current_setting('test.cw_business')::uuid,'+221770000088','member',array['bookings.read','bookings.manage','messages.read','messages.reply','services.read'],repeat('e',64),current_setting('test.cw_employee')::uuid)::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cw_staff'),'role','authenticated')::text,true);
do $$declare r jsonb;begin
 r:=public.respond_business_invitation(repeat('e',64));if r->>'state'<>'accepted' or r->>'collaboratorId'<>current_setting('test.cw_employee') then raise exception 'Invitation failed to retain existing employee';end if;
 r:=public.get_my_collaborator_calendar();if jsonb_array_length(r)<>1 or jsonb_array_length(r->0->'hours')<>1 or jsonb_array_length(r->0->'services')<>1 then raise exception 'Existing schedule/qualification lost';end if;
 begin perform public.staff_add_working_hours(current_setting('test.cw_colleague')::uuid,1,'08:00','09:00');raise exception 'Other employee edited';exception when insufficient_privilege then null;end;
end $$;
select public.staff_add_working_hours(current_setting('test.cw_employee')::uuid,(extract(dow from current_setting('test.cw_start')::timestamptz)::integer+1)%7,'10:00','18:00');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cw_client'),'role','authenticated')::text,true);
insert into public.bookings(client_id,provider_id,provider_service_id,collaborator_id,starts_at,ends_at,status,location_mode,total_amount,currency)
values(current_setting('test.cw_client')::uuid,current_setting('test.cw_owner')::uuid,current_setting('test.cw_service')::uuid,current_setting('test.cw_employee')::uuid,current_setting('test.cw_start')::timestamptz,current_setting('test.cw_start')::timestamptz+interval '1 hour','pending','salon',10000,'XOF');
reset role;
select set_config('test.cw_booking',(select id::text from public.bookings where provider_id=current_setting('test.cw_owner')::uuid limit 1),true);


set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cw_staff'),'role','authenticated')::text,true);
select public.staff_set_service(current_setting('test.cw_employee')::uuid,current_setting('test.cw_service')::uuid,true);
select public.staff_declare_service(current_setting('test.cw_employee')::uuid,'Tresses spéciales','Déclaration de compétence');
do $$begin
 begin perform public.staff_set_service(current_setting('test.cw_colleague')::uuid,current_setting('test.cw_service')::uuid,false);raise exception 'Edited colleague services';exception when insufficient_privilege then null;end;
 begin perform public.assign_salon_staff_task(current_setting('test.cw_business')::uuid,current_setting('test.cw_colleague')::uuid,'Tâche interdite');raise exception 'Staff assigned task';exception when insufficient_privilege then null;end;
 if (select count(*)from public.list_staff_service_declarations())<>1 then raise exception 'Self declaration missing';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cw_owner'),'role','authenticated')::text,true);
select set_config('test.cw_task',public.assign_salon_staff_task(current_setting('test.cw_business')::uuid,current_setting('test.cw_employee')::uuid,'Préparer le matériel','Nettoyer les accessoires',now()+interval '1 day')::text,true);
do $$begin
 if (select count(*)from public.list_staff_service_declarations(current_setting('test.cw_business')::uuid))<>1 then raise exception 'Owner cannot see declaration';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cw_staff'),'role','authenticated')::text,true);
select public.update_my_staff_task(current_setting('test.cw_task')::uuid,'in_progress');
select public.update_my_staff_task(current_setting('test.cw_task')::uuid,'done');
do $$begin
 if not exists(select 1 from public.list_my_staff_tasks()where id=current_setting('test.cw_task')::uuid and status='done')then raise exception 'Assigned task missing';end if;
 begin perform id from public.salon_staff_tasks;raise exception 'Raw task data exposed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cw_colleague_account'),'role','authenticated')::text,true);
do $$begin
 if exists(select 1 from public.list_my_staff_tasks())then raise exception 'Other staff sees task';end if;
 if exists(select 1 from public.list_staff_service_declarations())then raise exception 'Other staff sees private declaration';end if;
 begin perform public.update_my_staff_task(current_setting('test.cw_task')::uuid,'todo');raise exception 'Other staff edits task';exception when insufficient_privilege then null;end;
end $$;
reset role;
update booking_private.collaborator_access set revoked_at=now()where collaborator_id=current_setting('test.cw_employee')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cw_staff'),'role','authenticated')::text,true);
do $$begin
 if exists(select 1 from public.list_my_staff_tasks())then raise exception 'Revoked access to tasks';end if;
 begin perform public.staff_declare_service(current_setting('test.cw_employee')::uuid,'Après révocation','');raise exception 'Revoked staff declares';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if not exists(select 1 from public.notifications where profile_id=current_setting('test.cw_staff')::uuid and kind='staff_task')then raise exception 'Task notification missing';end if;
 if not exists(select 1 from public.provider_services where id=current_setting('test.cw_service')::uuid and price_amount=10000)then raise exception 'Salon price changed';end if;
end $$;
select 'PASS: own service declarations and qualifications, owner task assignment, own task updates, outsider/colleague/revoked denied, prices preserved, notifications created' as result;
rollback;
