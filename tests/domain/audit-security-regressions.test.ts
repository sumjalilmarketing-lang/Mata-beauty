import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';
let db:PGlite;
const root='33333333-3333-4333-8333-333333333333';
const uid=(n:number)=>`bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,'0')}`;
const roles=['commercial_manager','commercial_agent','finance_manager','finance_agent','support_manager','support_agent'];
const migration='supabase/migrations/20261103161056_audit_booking_and_legacy_media_guards.sql';
async function source(file:string){return readFile(new URL('../../'+file,import.meta.url),'utf8');}
async function actor(id:string,aal='aal2',role='authenticated'){await db.exec('set local role '+role);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,aal,role})]);}
async function denied(sql:string,args:unknown[]=[]){await db.exec('savepoint denial');let error:unknown;try{await db.query(sql,args);}catch(e){error=e;}await db.exec('rollback to savepoint denial;release savepoint denial');expect(error).toBeTruthy();}
beforeAll(async()=>{
 db=new PGlite();for(const file of ['tests/fixtures/crm/bootstrap.sql','tests/fixtures/crm/rbac.sql','tests/fixtures/delegation/bootstrap.sql','supabase/migrations/20261006174629_internal_team_access.sql','tests/fixtures/delegation/existing-functions.sql','tests/fixtures/delegation/existing-triggers.sql','supabase/migrations/20261103112737_commercial_crm.sql','supabase/migrations/20261103120014_delegated_department_teams.sql']){let sql=await source(file);if(file.includes('20261006174629'))sql=sql.slice(0,sql.indexOf('-- Do not permit'));await db.exec(sql);}
 await db.exec(`create schema booking_private;grant usage on schema booking_private to authenticated;create function booking_private.active_staff_permission(uuid,uuid,text)returns boolean language sql as $$select false$$;
 create table public.bookings(id uuid primary key default gen_random_uuid(),client_id uuid,provider_id uuid,provider_service_id uuid,starts_at timestamptz,ends_at timestamptz,location_mode text,appointment_address text,total_amount integer check(total_amount>0),currency text,client_note text,collaborator_id uuid,status text);
 grant select,update on public.bookings to authenticated;alter table public.bookings enable row level security;
 create policy booking_read on public.bookings for select to authenticated using(client_id=auth.uid()or provider_id=auth.uid()or public.has_admin_permission('bookings.read'));
 create policy booking_update on public.bookings for update to authenticated using(client_id=auth.uid()or provider_id=auth.uid()or public.has_admin_permission('bookings.update'))with check(client_id=auth.uid()or provider_id=auth.uid()or public.has_admin_permission('bookings.update'));
 alter table storage.objects add column owner_id text;
 create table public.posts(id uuid primary key default gen_random_uuid(),status text,visibility text,video_url text,thumbnail_url text);
 grant select on public.posts to authenticated;
 create or replace function public.is_public_social_post(target uuid)returns boolean language sql stable as $$select exists(select 1 from public.posts where id=target and status='published'and visibility='public')$$;
 create policy legacy_media on storage.objects for select to authenticated using(bucket_id in('social-videos','social-thumbnails')and(owner_id=auth.uid()::text or public.is_admin()or exists(select 1 from public.posts p where p.status='published'and p.visibility='public'and(split_part(p.video_url,'/social-videos/',2)=objects.name or split_part(p.thumbnail_url,'/social-thumbnails/',2)=objects.name))));
 insert into public.admin_permissions(key)values('bookings.update')on conflict do nothing;`);
 await db.exec(await source('tests/fixtures/audit/booking-validation-before.sql'));
 await db.exec('create trigger validate_booking before update on public.bookings for each row execute function public.validate_booking_update()');
 for(let i=1;i<=8;i++){await db.query("insert into public.profiles(id,role,display_name)values($1,'admin',$2)",[uid(i),'Synthetic '+i]);if(i<=6)await db.query('insert into public.admin_user_roles(user_id,role_id)select $1,id from public.admin_roles where key=$2',[uid(i),roles[i-1]]);}
 await db.exec(await source(migration));
},60000);
afterAll(async()=>{await db?.close();});beforeEach(async()=>{await db.exec('begin');});afterEach(async()=>{await db.exec('rollback');});
async function booking(client:string,provider=uid(8),status='confirmed'){await db.exec('reset role');return(await db.query<{id:string}>("insert into public.bookings(client_id,provider_id,total_amount,currency,status)values($1,$2,10000,'XOF',$3)returning id",[client,provider,status])).rows[0].id;}
for(const [i,role]of roles.entries())it(role+' cannot change its own contract price with MFA',async()=>{const b=await booking(uid(i+1));await actor(uid(i+1));expect((await db.query<{allowed:boolean}>("select public.has_admin_permission('bookings.update')allowed")).rows[0].allowed).toBe(false);await denied('update public.bookings set total_amount=1 where id=$1',[b]);});
for(const state of ['pending','confirmed'])it('client can cancel own service from '+state,async()=>{const b=await booking(uid(7),uid(7),state);await actor(uid(7));expect((await db.query("update public.bookings set status='cancelled_by_client'where id=$1 returning status",[b])).rows).toEqual([{status:'cancelled_by_client'}]);});
it('ordinary client and provider cancellation remain valid',async()=>{for(const [who,next]of [[uid(7),'cancelled_by_client'],[uid(8),'cancelled_by_provider']]){const b=await booking(uid(7));await actor(who);expect((await db.query('update public.bookings set status=$1 where id=$2 returning status',[next,b])).rows).toEqual([{status:next}]);}});
it('outsider cannot modify another booking',async()=>{const b=await booking(uid(7));await actor(uid(1));expect((await db.query("update public.bookings set status='cancelled_by_client'where id=$1 returning id",[b])).rows).toEqual([]);});
it('explicit booking admin permission allows status management but preserves price',async()=>{const b=await booking(uid(7));await actor(root);expect((await db.query("update public.bookings set status='pending'where id=$1 returning status",[b])).rows).toEqual([{status:'pending'}]);await denied('update public.bookings set total_amount=1 where id=$1',[b]);});
it('service-role server operations remain possible',async()=>{const b=await booking(uid(7));await actor(uid(7),'aal1','service_role');await db.exec('reset role');expect((await db.query('update public.bookings set total_amount=11000 where id=$1 returning total_amount',[b])).rows).toEqual([{total_amount:11000}]);});
it('does not allow an MFA downgrade to bypass contract immutability',async()=>{const b=await booking(uid(1));await actor(uid(1),'aal1');await denied('update public.bookings set total_amount=1 where id=$1',[b]);});
it('legacy videos and thumbnails enforce owner/public boundaries for scoped actors',async()=>{
 await db.query("insert into public.posts(status,visibility,video_url,thumbnail_url)values('published','public','https://example.test/social-videos/public.mp4','https://example.test/social-thumbnails/public.jpg')");
 for(const [bucket,ext]of [['social-videos','mp4'],['social-thumbnails','jpg']])for(const [name,owner]of [['private',uid(8)],['own',uid(1)],['public',uid(8)]])await db.query('insert into storage.objects(bucket_id,name,owner_id)values($1,$2,$3)',[bucket,name+'.'+ext,owner]);
 await actor(uid(1));expect((await db.query<{name:string}>('select name from storage.objects order by name')).rows.map(r=>r.name)).toEqual(['own.jpg','own.mp4','public.jpg','public.mp4']);
});
it('fails safely if the trigger definition has drifted',async()=>{const isolated=new PGlite();try{await isolated.exec('create function public.validate_booking_update()returns trigger language plpgsql as $$begin return new;end$$');await expect(isolated.exec(await source(migration))).rejects.toThrow('Unexpected validate_booking_update definition');}finally{await isolated.close();}},60000);
