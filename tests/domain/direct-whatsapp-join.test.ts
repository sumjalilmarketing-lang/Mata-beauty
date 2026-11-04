import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
const owner='11111111-1111-4111-8111-111111111111', recipient='22222222-2222-4222-8222-222222222222', business='33333333-3333-4333-8333-333333333333', invite='44444444-4444-4444-8444-444444444444';
const hash='b'.repeat(64);let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(await readFile(new URL('../fixtures/whatsapp/bootstrap.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../../supabase/migrations/20261104124043_direct_whatsapp_salon_join.sql',import.meta.url),'utf8'));},60000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
 await db.exec('reset role;truncate auth.users,profiles,businesses,business_invitations,booking_private.business_invitation_secrets,booking_private.phone_invitation_claims,collaborators,booking_private.collaborator_access,booking_private.business_invitation_events,notifications');
 await db.query('insert into auth.users(id,email_confirmed_at) values ($1,now()),($2,now())',[owner,recipient]);
 await db.query("insert into profiles(id,display_name) values ($1,'Responsable'),($2,'Équipier')",[owner,recipient]);
 await db.query("insert into businesses values ($1,'Salon de recette',$2)",[business,owner]);
 await db.query("insert into business_invitations(id,business_id,recipient_phone,internal_role,status,invited_by,expires_at) values($1,$2,'+221770000099','member','pending',$3,now()+interval '48 hours')",[invite,business,owner]);
 await db.query("insert into booking_private.business_invitation_secrets values($1,$2,array['bookings.read'])",[invite,hash]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[recipient]);
});
it('grants exactly the invitation rights on acceptance and consumes the secret',async()=>{
 await db.exec('set role authenticated');
 const result=await db.query<{r:{state:string}}>('select public.respond_business_invitation($1) r',[hash]);expect(result.rows[0].r.state).toBe('accepted');
 await expect(db.query('select public.respond_business_invitation($1)',[hash])).rejects.toThrow('Invitation invalide');
 await db.exec('reset role');const grants=await db.query<{permissions:string[];granted_by:string;profile_id:string;business_id:string}>('select * from booking_private.collaborator_access');
 expect(grants.rows).toHaveLength(1);expect(grants.rows[0]).toMatchObject({permissions:['bookings.read'],granted_by:owner,profile_id:recipient,business_id:business});
 expect((await db.query('select * from booking_private.business_invitation_secrets')).rows).toHaveLength(0);
});
it('only previews the salon name and rejects an unknown link',async()=>{
 await db.exec('set role anon');expect((await db.query<{r:unknown}>('select public.preview_business_invitation($1) r',[hash])).rows[0].r).toEqual({salonName:'Salon de recette'});
 expect((await db.query<{r:unknown}>('select public.preview_business_invitation($1) r',['c'.repeat(64)])).rows[0].r).toBeNull();
 await expect(db.query('select public.respond_business_invitation($1)',[hash])).rejects.toThrow('permission denied');
});
it('rejects expired and revoked invitations',async()=>{
 await db.exec("update business_invitations set expires_at=now()-interval '1 second'");await expect(db.query('select public.respond_business_invitation($1)',[hash])).rejects.toThrow('Invitation invalide');
 await db.exec("update business_invitations set expires_at=now()+interval '1 hour',status='revoked'");await expect(db.query('select public.respond_business_invitation($1)',[hash])).rejects.toThrow('Invitation invalide');
});
it('rejects suspended and unconfirmed accounts without creating access',async()=>{
 await db.query('update profiles set is_suspended=true where id=$1',[recipient]);await expect(db.query('select public.respond_business_invitation($1)',[hash])).rejects.toThrow('Compte actif');
 await db.exec('update profiles set is_suspended=false;update auth.users set email_confirmed_at=null');await expect(db.query('select public.respond_business_invitation($1)',[hash])).rejects.toThrow('Compte actif');
 expect((await db.query('select * from booking_private.collaborator_access')).rows).toHaveLength(0);
});
it('does not turn the salon owner into an employee or consume their invitation',async()=>{
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);expect((await db.query<{r:unknown}>('select public.respond_business_invitation($1) r',[hash])).rows[0].r).toEqual({state:'owner'});
 expect((await db.query('select * from booking_private.business_invitation_secrets')).rows).toHaveLength(1);
});
