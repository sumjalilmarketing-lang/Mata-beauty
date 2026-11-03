import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const state=vi.hoisted(()=>({status:'active',suspended:false,missing:false}));
vi.mock('@/lib/payments/server',()=>({serviceSupabase:()=>({from:(table:string)=>{
 const query={select:()=>query,eq:()=>table==='account_roles'?Promise.resolve({data:[{role:'customer'}],error:null}):query,maybeSingle:async()=>({data:state.missing?null:{id:'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',role:'client',is_suspended:state.suspended,account_status:state.status},error:null})};return query;
}})}));
import {loadOwnClientSocialProfile} from '@/lib/profiles/public-social-profile';
beforeEach(()=>{state.status='active';state.suspended=false;state.missing=false;});
describe('private client profile access',()=>{
 it.each(['disabled','deleted','suspended'])('does not expose the profile of a %s account even with a session',async status=>{state.status=status;expect(await loadOwnClientSocialProfile('aaaaaaaa-aaaa-4aaa-8aaa-000000000008')).toEqual({status:'suspended',profile:null});});
 it('denies an explicitly suspended profile',async()=>{state.suspended=true;expect((await loadOwnClientSocialProfile('aaaaaaaa-aaaa-4aaa-8aaa-000000000008')).status).toBe('suspended');});
 it('distinguishes a missing profile',async()=>{state.missing=true;expect((await loadOwnClientSocialProfile('aaaaaaaa-aaaa-4aaa-8aaa-000000000008')).status).toBe('profile_missing');});
});
