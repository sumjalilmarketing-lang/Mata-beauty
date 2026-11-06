"use client";
import {useEffect,useRef,useState} from "react";
import type {Worker} from "tesseract.js";
import {getSupabaseBrowserClient} from "@/lib/supabase/client";
import {parseTariffText,type TariffDraft} from "@/lib/domain/tariff-import";
import {serviceReference} from "@/lib/domain/service-reference";
import {serviceDetailsError} from "@/lib/domain/service-creation";
import "./tariff-photo-import.css";
export function TariffPhotoImport({userId,businessId,currency,catalog,onSaved,activate=true}:{userId:string;businessId?:string;activate?:boolean;currency:string|null;catalog:readonly {id:string;name:string}[];onSaved:()=>void|Promise<void>}){
 const [rows,setRows]=useState<TariffDraft[]>([]),[text,setText]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[verified,setVerified]=useState(false);
 const worker=useRef<Worker|null>(null),request=useRef(0),saveLock=useRef(false);
 useEffect(()=>()=>{request.current++;void worker.current?.terminate().catch(()=>undefined);},[]);
 function change(index:number,field:keyof TariffDraft,value:string|boolean){setVerified(false);setRows(current=>current.map((row,i)=>i===index?{...row,[field]:value}:row));}
 async function read(file:File){
  if(busy||saving)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){setNotice('Choisissez une photo JPG, PNG ou WebP de 8 Mo maximum.');return;}
  const version=++request.current;setBusy(true);setNotice('Lecture de la photo sur cet appareil…');setVerified(false);
  let timer:ReturnType<typeof setTimeout>|undefined;
  let localWorker:Worker|null=null;
  try{
   const image=new Image(),url=URL.createObjectURL(file);
   try{image.src=url;await image.decode();}finally{URL.revokeObjectURL(url);}
   const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const context=canvas.getContext('2d');if(!context)throw Error('canvas');context.drawImage(image,0,0,canvas.width,canvas.height);
   const {createWorker}=await import('tesseract.js');
   const work=async()=>{const instance=await createWorker('fra',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr',langPath:'/ocr',workerBlobURL:false});if(version!==request.current){await instance.terminate();throw Error('cancelled');}localWorker=instance;worker.current=instance;return instance.recognize(canvas);};
   const result=await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),90000);})]);
   if(version!==request.current)return;
   setText(result.data.text);const drafts=parseTariffText(result.data.text);setRows(drafts);setNotice(drafts.length?`${drafts.length} ligne(s) détectée(s). Vérifiez les noms et les prix, puis renseignez les durées manquantes.`:'Aucun tarif reconnu. Vous pouvez corriger le texte lu ou ajouter des lignes manuellement.');
  }catch{if(version===request.current){setNotice('La lecture n’a pas abouti. Essayez une photo plus nette ou ajoutez vos prestations manuellement ci-dessous.');request.current++;setBusy(false);}}
  finally{clearTimeout(timer);if(localWorker){await (localWorker as Worker).terminate().catch(()=>undefined);if(worker.current===localWorker)worker.current=null;}if(version===request.current)setBusy(false);}
 }
 async function save(){
  if(saveLock.current||busy)return;const client=getSupabaseBrowserClient();if(!client||!currency){setNotice('Enregistrez d’abord le pays, le fuseau horaire et la devise de votre activité.');return;}
  const chosen=rows.filter(row=>row.selected);if(!verified||!chosen.length){setNotice('Vérifiez les lignes et cochez la confirmation avant de les ajouter.');return;}
  const reference=serviceReference('',catalog);
  for(const row of chosen){const error=serviceDetailsError({serviceId:reference,title:row.title,durationMinutes:Number(row.duration),priceAmount:Number(row.price)});if(error||!row.price.trim()||!row.duration.trim()){setNotice(`${row.title||'Prestation'} : ${error??'Renseignez un prix et une durée.'}`);return;}}
  const names=chosen.map(row=>row.title.trim().toLocaleLowerCase('fr'));if(new Set(names).size!==names.length){setNotice('Deux lignes portent le même nom. Corrigez-les ou désélectionnez le doublon.');return;}
  saveLock.current=true;setSaving(true);
  try{
   const payload=chosen.map(row=>({provider_id:userId,business_id:businessId??null,service_id:reference,title:row.title.trim(),description:row.description.trim()||null,duration_minutes:Number(row.duration),price_amount:Number(row.price),currency,is_active:activate}));
   let result=await client.from('provider_services').insert(payload.map(row=>({...row,status:activate?'published':'draft'}))).select('id').abortSignal(AbortSignal.timeout(20000));
   // A schema-cache rejection guarantees no insert happened on legacy schemas.
   if(result.error?.code==='PGRST204' && /['"]status['"]/i.test(result.error.message))result=await client.from('provider_services').insert(payload).select('id').abortSignal(AbortSignal.timeout(20000));
   if(result.error||result.data?.length!==chosen.length)throw Error('save');
   setRows([]);setText('');setVerified(false);
   const success=activate?`${chosen.length} prestation(s) ajoutée(s).`:`${chosen.length} prestation(s) enregistrée(s) en brouillon. Publiez vos horaires pour les activer.`;
   setNotice(success);try{await onSaved();}catch{setNotice(success+' Actualisez le catalogue pour les voir.');}
  }
  catch{setNotice('Ajout non confirmé. Actualisez votre catalogue avant de réessayer pour vérifier les éventuels doublons. Vos lignes sont conservées.');}
  finally{setSaving(false);saveLock.current=false;}
 }
 return <details className="tariff-import"><summary>📷 Importer ma carte de prestations</summary><form onSubmit={event=>event.preventDefault()}><p>Photographiez votre grille tarifaire ou choisissez une image. La photo est lue sur votre appareil. Vérifiez chaque ligne avant publication ; les durées ne sont pas inventées.</p><label>Photo des prestations et tarifs<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||saving} onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void read(file);}}/></label><small>JPG, PNG, WebP · 8 Mo maximum · première lecture plus longue pour charger l’outil.</small>{notice&&<p role="status">{notice}</p>}{busy&&<button type="button" onClick={()=>{request.current++;void worker.current?.terminate().catch(()=>undefined);worker.current=null;setBusy(false);setNotice('Lecture annulée.');}}>Annuler la lecture</button>}
 {text&&<details><summary>Voir et corriger le texte lu</summary><textarea aria-label="Texte lu sur la photo" value={text} maxLength={20000} disabled={busy||saving} onChange={event=>setText(event.target.value)}/><button type="button" disabled={busy||saving} onClick={()=>{setRows(parseTariffText(text));setVerified(false);}}>Recalculer les lignes depuis ce texte</button></details>}
 <div className="tariff-import-rows">{rows.map((row,index)=><fieldset key={index} disabled={busy||saving}><legend>Prestation {index+1}</legend><label><input type="checkbox" checked={row.selected} onChange={event=>change(index,'selected',event.target.checked)}/>Ajouter cette prestation</label><label>Nom<input value={row.title} maxLength={120} onChange={event=>change(index,'title',event.target.value)}/></label><label>Prix ({currency??'devise à définir'})<input type="number" min="0" step="1" value={row.price} onChange={event=>change(index,'price',event.target.value)}/></label><label>Durée en minutes (obligatoire)<input type="number" min="15" max="720" step="1" placeholder="À renseigner" value={row.duration} onChange={event=>change(index,'duration',event.target.value)}/></label><label>Description<textarea value={row.description} maxLength={3000} onChange={event=>change(index,'description',event.target.value)}/></label></fieldset>)}</div>
 <button type="button" disabled={busy||saving||rows.length>=40} onClick={()=>{setRows(current=>[...current,{title:'',price:'',duration:'',description:'',selected:true}]);setVerified(false);}}>Ajouter une ligne manuellement</button>{rows.length>0&&<><label><input type="checkbox" checked={verified} disabled={busy||saving} onChange={event=>setVerified(event.target.checked)}/>J’ai vérifié les noms, les prix, la devise et les durées.</label><button type="button" disabled={busy||saving||!verified} onClick={()=>void save()}>{saving?'Enregistrement…':'Ajouter les prestations sélectionnées'}</button></>}</form></details>;
}
