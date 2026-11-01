import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.env.REMOTE_SUPABASE_URL,production=url==='https://qjdwxdbvrxedyfolnpol.supabase.co';assert(production?process.env.ALLOW_PRODUCTION_QA==='mata-beauty.com':url==='https://kazlvtxkbsdhbfvtqqdp.supabase.co');
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,opts),api=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,opts),reset=createClient(url,process.env.REMOTE_SUPABASE_ANON_KEY,opts);
const results=[],email=`qa-policy-${randomUUID()}@example.test`,password=`QA-${randomUUID()}!`;let id;
const invalid=[['too short','Aa1!short'],['missing uppercase','lowercase123456!'],['missing lowercase','UPPERCASE123456!'],['missing number','MixedWithoutDigit!'],['missing symbol','MixedWithoutSymbol123']];
try{
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{qa_suppress_email:true},user_metadata:{legal_accepted:true}});assert.ifError(made.error);id=made.data.user.id;await admin.from('welcome_email_deliveries').update({status:'needs_review'}).eq('user_id',id);
 assert.ifError((await api.auth.signInWithPassword({email,password})).error);
 for(const [name,weak] of invalid){const r=await api.auth.updateUser({password:weak});results.push({name:'Authenticated password change rejects '+name,status:r.error?.code==='weak_password'?'PASS':'FAIL',code:r.error?.code??null});}
 const link=await admin.auth.admin.generateLink({type:'recovery',email});assert.ifError(link.error);assert.ifError((await reset.auth.verifyOtp({type:'recovery',token_hash:link.data.properties.hashed_token})).error);
 for(const [name,weak] of invalid){const r=await reset.auth.updateUser({password:weak});results.push({name:'Recovery session rejects '+name,status:r.error?.code==='weak_password'?'PASS':'FAIL',code:r.error?.code??null});}
 const next=`New-${randomUUID()}!`;assert.ifError((await reset.auth.updateUser({password:next})).error);assert.ifError((await api.auth.signInWithPassword({email,password:next})).error);assert.equal((await api.auth.getUser()).data.user.id,id);results.push({name:'Strong reset and login retain the same Client',status:'PASS'});
 for(const [name,weak] of invalid){const r=await api.auth.signUp({email:`delivered+qa-policy-${randomUUID()}@resend.dev`,password:weak,options:{data:{legal_accepted:true}}});if(r.data.user?.id)await admin.auth.admin.deleteUser(r.data.user.id);results.push({name:'Signup rejects '+name,status:r.error?.code==='weak_password'?'PASS':'FAIL',code:r.error?.code??null});}
}finally{await api.auth.signOut({scope:'global'});await reset.auth.signOut({scope:'global'});if(id)assert.ifError((await admin.auth.admin.deleteUser(id)).error);await writeFile(`work/auth-audit/password-policy-${production?'production':'qa'}.json`,JSON.stringify({date:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));}
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
