import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {beforeAll,afterAll,it,expect} from 'vitest';
const db=new PGlite();
beforeAll(async()=>{
 await db.exec("create table provider_profiles(profile_id text primary key,status text);insert into provider_profiles values('owner','approved'),('unapproved','pending_review');create table provider_services(id int primary key,provider_id text,status text default 'published',is_active boolean default true,published_at timestamptz,archived_at timestamptz);");
 await db.exec(await readFile(new URL('../../tests/fixtures/audit/service-commercial-trigger.sql',import.meta.url),'utf8'));
 await db.exec('create trigger commercial_status before insert or update of status on provider_services for each row execute function sync_provider_service_commercial_status();');
},60000);
afterAll(()=>db.close());
it('reproduces production overriding an inactive insert when status is omitted',async()=>{await db.exec("insert into provider_services(id,provider_id,is_active) values(1,'owner',false)");expect((await db.query('select is_active from provider_services where id=1')).rows).toEqual([{is_active:true}]);});
it('keeps a service explicitly drafted while schedules are missing',async()=>{await db.exec("insert into provider_services(id,provider_id,status,is_active) values(2,'owner','draft',false)");expect((await db.query('select status,is_active,published_at from provider_services where id=2')).rows).toEqual([{status:'draft',is_active:false,published_at:null}]);});
it('publishes for an approved owner and archives without staying bookable',async()=>{await db.exec("insert into provider_services(id,provider_id,status) values(3,'owner','published');update provider_services set status='archived' where id=3");expect((await db.query('select is_active,archived_at is not null as archived from provider_services where id=3')).rows[0]).toEqual({is_active:false,archived:true});});
it('rejects publishing for an unapproved professional',async()=>{await expect(db.exec("insert into provider_services(id,provider_id,status) values(4,'unapproved','published')")).rejects.toThrow('Profil professionnel non approuvé');});
