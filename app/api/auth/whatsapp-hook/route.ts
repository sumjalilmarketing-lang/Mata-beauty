import {verifyAuthHook,whatsappAuthConfiguration,whatsappCodeMessage} from '@/lib/auth/whatsapp-hook';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function failure(status:number,message:string){return Response.json({error:{http_code:status,message}},{status,headers});}
export async function POST(request:Request){
 const config=whatsappAuthConfiguration();if(!config)return failure(503,'WhatsApp authentication is not configured.');
 if(Number(request.headers.get('content-length')??0)>65536)return failure(413,'Payload too large.');
 let body='';const reader=request.body?.getReader();if(!reader)return failure(400,'Invalid request.');
 const decoder=new TextDecoder();let bytes=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>65536){await reader.cancel();return failure(413,'Payload too large.');}body+=decoder.decode(chunk.value,{stream:true});}body+=decoder.decode();}catch{return failure(400,'Invalid request.');}
 if(!verifyAuthHook(body,request.headers,config.secret))return failure(401,'Invalid hook signature.');
 let payload:unknown;try{payload=JSON.parse(body);}catch{return failure(400,'Invalid request.');}
 if(!payload||typeof payload!=='object')return failure(400,'Invalid request.');
 const value=payload as {user?:{phone?:unknown;phone_change?:unknown};sms?:{otp?:unknown}};
 const raw=value.user?.phone_change||value.user?.phone,code=value.sms?.otp;
 const phone=typeof raw==='string'?`+${raw.replace(/^\+/,'')}`:'';
 if(!/^\+[1-9]\d{7,14}$/.test(phone)||typeof code!=='string'||!/^\d{6}$/.test(code))return failure(400,'Invalid authentication payload.');
 try{
  const result=await fetch(`https://graph.facebook.com/${config.version}/${config.phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify(whatsappCodeMessage(phone,code,config.template,config.language)),signal:AbortSignal.timeout(3500),redirect:'error'});
  if(!result.ok)return failure(502,'WhatsApp could not accept the authentication message.');
  const receipt=await result.json() as {messages?:{id?:unknown}[]};
  if(typeof receipt.messages?.[0]?.id!=='string')return failure(502,'WhatsApp acknowledgement missing.');
  return Response.json({},{status:200,headers});
 }catch{return failure(502,'WhatsApp is temporarily unavailable.');}
}
