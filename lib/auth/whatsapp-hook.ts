import {createHmac,timingSafeEqual} from 'node:crypto';

export function verifyAuthHook(body:string,headers:Headers,secret:string,now=Date.now()):boolean {
 const id=headers.get('webhook-id'),timestamp=headers.get('webhook-timestamp'),signatures=headers.get('webhook-signature');
 if(!id||id.length>256||!timestamp||!/^\d{1,12}$/.test(timestamp)||!signatures||signatures.length>4096||Math.abs(now/1000-Number(timestamp))>300)return false;
 const encoded=secret.replace(/^v1,whsec_|^whsec_/,'');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return false;
 const key=Buffer.from(encoded,'base64');if(key.length<32)return false;
 const expected=createHmac('sha256',key).update(`${id}.${timestamp}.${body}`).digest();
 return signatures.split(/\s+/).some(value=>{const [version,signature]=value.split(',');if(version!=='v1'||!signature||!/^[A-Za-z0-9+/]+={0,2}$/.test(signature))return false;const actual=Buffer.from(signature,'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected);});
}
export function whatsappAuthConfiguration() {
 const token=process.env.WHATSAPP_ACCESS_TOKEN,phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID,template=process.env.WHATSAPP_AUTH_TEMPLATE_NAME,language=process.env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE,version=process.env.WHATSAPP_GRAPH_VERSION,secret=process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
 if(process.env.WHATSAPP_AUTH_ENABLED!=='true'||!token||!phoneId||!/^\d+$/.test(phoneId)||!template||!/^[a-z0-9_]+$/.test(template)||!language||!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)||!version||!/^v\d+\.\d+$/.test(version)||!secret)return null;
 return {token,phoneId,template,language,version,secret};
}
export function whatsappCodeMessage(phone:string,code:string,template:string,language:string) {
 return {messaging_product:'whatsapp',to:phone.replace(/^\+/,''),type:'template',template:{name:template,language:{code:language},components:[{type:'body',parameters:[{type:'text',text:code}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]}]}};
}
