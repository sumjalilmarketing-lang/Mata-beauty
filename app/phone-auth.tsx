"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {getSupabaseBrowserClient} from '@/lib/supabase/client';
import {normalizeInvitationPhone} from '@/lib/domain/salon-invitation-phone';
import {SUPPORTED_COUNTRIES} from '@/lib/domain/international';

export function PhoneAuth({registering,locale,onVerified,onBusyChange}:{registering:boolean;locale:string;onVerified:()=>Promise<void>;onBusyChange:(busy:boolean)=>void}){
 const [available,setAvailable]=useState<boolean|null>(null),[phone,setPhone]=useState(''),[name,setName]=useState(''),[country,setCountry]=useState(''),[consent,setConsent]=useState(false),[sent,setSent]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[retryAt,setRetryAt]=useState(0),[clock,setClock]=useState(0);
 const lock=useRef(false);const [attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();void fetch('/api/auth/providers',{cache:'no-store',signal:controller.signal}).then(async result=>{if(!result.ok)throw Error();const data=await result.json() as {whatsapp?:boolean};setAvailable(data.whatsapp===true);}).catch(()=>{if(!controller.signal.aborted)setAvailable(false);});return()=>controller.abort();},[attempt]);
 useEffect(()=>{if(!retryAt)return;const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer);},[retryAt]);
 async function send(event:FormEvent){
  event.preventDefault();if(lock.current||!available||Date.now()<retryAt)return;
  const normalized=normalizeInvitationPhone(phone),client=getSupabaseBrowserClient();
  if(!normalized||!client||(registering&&(!name.trim()||!country||!consent))){setNotice('Vérifiez votre numéro, votre nom, votre pays et les conditions.');return;}
  lock.current=true;setBusy(true);onBusyChange(true);setNotice('');
  try{
   const session=await client.auth.getSession();if(session.data.session){setNotice('Un compte est déjà connecté. Déconnectez-vous avant de choisir un autre compte.');return;}
   // Supabase creates/verifies the OTP. Its signed Send SMS hook delivers it via Meta WhatsApp.
   const result=await client.auth.signInWithOtp({phone:normalized,options:{channel:'sms',shouldCreateUser:registering,...(registering?{data:{display_name:name.trim(),country_code:country,locale:`${locale.slice(0,2)}-${country}`,legal_accepted:true,professional_intent:false}}:{})}});
   if(result.error)throw result.error;
   setPhone(normalized);setSent(true);setRetryAt(Date.now()+60000);setClock(Date.now());setNotice('Code demandé sur WhatsApp. Saisissez le code reçu.');
  }catch{setNotice('Le code n’a pas pu être envoyé. Vérifiez votre numéro avec indicatif, puis réessayez plus tard.');}
  finally{lock.current=false;setBusy(false);onBusyChange(false);}
 }
 async function verify(event:FormEvent){event.preventDefault();if(lock.current||!/^\d{6}$/.test(code))return;const client=getSupabaseBrowserClient();if(!client)return;lock.current=true;setBusy(true);onBusyChange(true);setNotice('');try{const result=await client.auth.verifyOtp({phone,token:code,type:'sms'});if(result.error||!result.data.session)throw Error();await onVerified();}catch{setNotice('Code invalide, expiré ou accès indisponible. Vérifiez le code reçu et réessayez.');}finally{lock.current=false;setBusy(false);onBusyChange(false);}}
 return <section aria-label="Connexion par WhatsApp">
  {available===null?<p role="status">Vérification de la connexion WhatsApp…</p>:available===false?<><p role="status">La connexion par WhatsApp est en cours d’activation. L’email et Google restent disponibles.</p><button type="button" onClick={()=>{setAvailable(null);setAttempt(value=>value+1);}}>Vérifier à nouveau</button></>:<>
   <p>{registering?'Créez votre compte avec votre numéro WhatsApp, sans adresse email ni mot de passe.':'Recevez un code sur le numéro WhatsApp de votre compte.'}</p>
   {sent?<form onSubmit={event=>void verify(event)}><label>Code reçu sur WhatsApp<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy} onChange={event=>setCode(event.target.value)} /></label><button className="primary-button full" disabled={busy}>{busy?'Vérification…':'Valider mon code'}</button><button type="button" disabled={busy} onClick={()=>{setSent(false);setCode('');setNotice('');}}>Modifier le numéro ou renvoyer un code</button></form>:<form onSubmit={event=>void send(event)}>
    {registering&&<><label>Nom complet<input autoComplete="name" required maxLength={80} value={name} disabled={busy} onChange={event=>setName(event.target.value)} /></label><label>Pays de résidence<select aria-label="Pays de résidence" required value={country} disabled={busy} onChange={event=>setCountry(event.target.value)}><option value="">Choisir un pays</option>{SUPPORTED_COUNTRIES.map(item=><option key={item.code} value={item.code}>{new Intl.DisplayNames([locale],{type:'region'}).of(item.code)??item.name}</option>)}</select></label></>}
    <label>Numéro WhatsApp avec indicatif<input autoComplete="tel" type="tel" placeholder="+221771234567" required value={phone} disabled={busy} onChange={event=>setPhone(event.target.value)} /></label>
    {registering&&<label className="legal-consent"><input type="checkbox" checked={consent} disabled={busy} required onChange={event=>setConsent(event.target.checked)} /><span>J’accepte les <Link href="/legal/conditions-generales" target="_blank" rel="noopener noreferrer">conditions générales</Link> et la <Link href="/legal/confidentialite" target="_blank" rel="noopener noreferrer">politique de confidentialité</Link> de Mata Beauty et je souhaite recevoir mon code sur WhatsApp.</span></label>}
    <button className="primary-button full" disabled={busy||!normalizeInvitationPhone(phone)||(registering&&(!name.trim()||!country||!consent))||clock<retryAt}>{busy?'Envoi…':clock<retryAt?'Patientez avant de renvoyer un code':'Recevoir mon code sur WhatsApp'}</button>
   </form>}
  </>}{notice&&<p className="auth-feedback" role="status">{notice}</p>}
 </section>;
}
