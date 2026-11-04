import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
it('reservation notifications open the salon or independent provider workspace as appropriate',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;
   create table provider_services(id uuid,title text);
   create table notifications(profile_id uuid,kind text,title text,body text,data jsonb);
   create table bookings(id uuid,provider_id uuid,provider_service_id uuid,business_id uuid,collaborator_name text,source_post_id uuid);`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261104133011_collaborator_notification_destination.sql',import.meta.url),'utf8'));
  await db.exec(`create trigger booking_notification after insert on bookings for each row execute function notify_booking_created();
   insert into bookings(id,business_id) values ('11111111-1111-4111-8111-111111111111',null),('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');`);
  const result=await db.query<{href:string}>("select data->>'href' href from notifications order by data->>'booking_id'");
  expect(result.rows.map(r=>r.href)).toEqual(['/pro/bookings#booking-11111111-1111-4111-8111-111111111111','/salon/bookings#booking-22222222-2222-4222-8222-222222222222']);
 }finally{await db.close();}
},60000);
