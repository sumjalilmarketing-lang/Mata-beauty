import {afterEach,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {verifyAuthHook,whatsappCodeMessage} from '@/lib/auth/whatsapp-hook';
import {POST} from '@/app/api/auth/whatsapp-hook/route';
const key=Buffer.alloc(32,9),secret='v1,whsec_'+key.toString('base64');
const payload=JSON.stringify({user:{phone:'221770000099'},sms:{otp:'123456'}});
function signed(body=payload,seconds=Math.floor(Date.now()/1000)){const timestamp=String(seconds);return new Headers({'webhook-id':'test-hook-unique','webhook-timestamp':timestamp,'webhook-signature':'v1,'+createHmac('sha256',key).update(`test-hook-unique.${timestamp}.${body}`).digest('base64')});}
function configure(){for(const [k,v] of Object.entries({WHATSAPP_AUTH_ENABLED:'true',WHATSAPP_ACCESS_TOKEN:'test-not-a-real-token',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_AUTH_TEMPLATE_NAME:'test_code',WHATSAPP_AUTH_TEMPLATE_LANGUAGE:'fr',WHATSAPP_GRAPH_VERSION:'v25.0',SUPABASE_SEND_SMS_HOOK_SECRET:secret}))vi.stubEnv(k,v);}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('accepts a signed Auth hook and rejects tampering, missing signatures, stale/future timestamps',()=>{
 expect(verifyAuthHook(payload,signed(),secret)).toBe(true);expect(verifyAuthHook(payload+' ',signed(),secret)).toBe(false);expect(verifyAuthHook(payload,new Headers(),secret)).toBe(false);
 expect(verifyAuthHook(payload,signed(payload,Math.floor(Date.now()/1000)-301),secret)).toBe(false);expect(verifyAuthHook(payload,signed(payload,Math.floor(Date.now()/1000)+301),secret)).toBe(false);
 const headers=signed();headers.set('webhook-signature','v1,invalid '+headers.get('webhook-signature'));expect(verifyAuthHook(payload,headers,secret)).toBe(true);
});
it('fails closed while disabled without sending a message',async()=>{vi.stubEnv('WHATSAPP_AUTH_ENABLED','false');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect((await POST(new Request('https://mata.test/api/auth/whatsapp-hook',{method:'POST',body:payload,headers:signed()}))).status).toBe(503);expect(fetch).not.toHaveBeenCalled();});
it('requires a valid hook signature before invoking Meta',async()=>{configure();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const r=await POST(new Request('https://mata.test/api/auth/whatsapp-hook',{method:'POST',body:payload}));expect(r.status).toBe(401);expect(fetch).not.toHaveBeenCalled();});
it('sends the Supabase code directly to Meta using the approved authentication template',async()=>{
 configure();const fetch=vi.fn().mockResolvedValue(Response.json({messages:[{id:'test-receipt'}]}));vi.stubGlobal('fetch',fetch);
 const response=await POST(new Request('https://mata.test/api/auth/whatsapp-hook',{method:'POST',body:payload,headers:signed()}));expect(response.status).toBe(200);expect(await response.json()).toEqual({});
 expect(fetch.mock.calls[0][0]).toBe('https://graph.facebook.com/v25.0/123456789/messages');const options=fetch.mock.calls[0][1] as RequestInit;expect(JSON.parse(String(options.body))).toEqual(whatsappCodeMessage('+221770000099','123456','test_code','fr'));
});
it('does not report success on provider rejection or missing acknowledgement and never exposes codes or tokens',async()=>{
 configure();const fetch=vi.fn().mockResolvedValueOnce(Response.json({error:'private provider diagnostic'},{status:400})).mockResolvedValueOnce(Response.json({}));vi.stubGlobal('fetch',fetch);
 for(let n=0;n<2;n++){const response=await POST(new Request('https://mata.test/api/auth/whatsapp-hook',{method:'POST',body:payload,headers:signed()}));expect(response.status).toBe(502);const text=await response.text();expect(text).not.toMatch(/123456|test-not-a-real-token|private provider diagnostic/);}
});
it('rejects invalid signed payloads and oversized bodies without sending',async()=>{
 configure();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);for(const body of ['{}',JSON.stringify({user:{phone:'invalid'},sms:{otp:'123456'}}),'x'.repeat(65537)]){const r=await POST(new Request('https://mata.test/api/auth/whatsapp-hook',{method:'POST',body,headers:signed(body)}));expect([400,413]).toContain(r.status);}expect(fetch).not.toHaveBeenCalled();
});
