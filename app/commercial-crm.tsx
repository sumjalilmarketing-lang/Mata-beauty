"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { crmStages, crmStageLabels, crmActivityLabels, crmLeadInput, emptyCrmLead, escapeCrmSearch, isCrmFollowUpDue, type CrmLead, type CrmActivity } from "@/lib/domain/crm";
import "./commercial-crm.css";

const leadFields = "id,name,contact_name,email,phone,city,address,source,stage,lost_reason,next_follow_up_at,linked_provider_id,assigned_to,created_by,created_at,updated_at,archived_at,version";
type Assignee = {id:string;label:string};
type Metrics = {total:number;due:number;stages:Record<string,number>};
const client = () => {const api=getSupabaseBrowserClient();if(!api) throw new Error("Session indisponible");return api;};
const when = (value:string|null) => value ? new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : "Aucune relance planifiée";
function localInput(value:string|null) {if(!value) return "";const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}

export function CommercialCrm({userId,canAssign,dueOnly=false}:{userId:string;canAssign:boolean;dueOnly?:boolean}) {
  const params=useSearchParams();
  const globalSearch=params.get("q") ?? "";
  const [search,setSearch]=useState(globalSearch),[term,setTerm]=useState(globalSearch);
  const [stage,setStage]=useState("all"),[archived,setArchived]=useState(false),[onlyDue,setOnlyDue]=useState(dueOnly),[page,setPage]=useState(0);
  const [rows,setRows]=useState<CrmLead[]>([]),[total,setTotal]=useState(0),[metrics,setMetrics]=useState<Metrics|null>(null),[assignees,setAssignees]=useState<Assignee[]>([]);
  const [selected,setSelected]=useState<CrmLead|"new"|null>(null),[state,setState]=useState<"loading"|"ready"|"error">("loading"),[revision,setRevision]=useState(0);
  useEffect(()=>{const timer=window.setTimeout(()=>{setSearch(globalSearch);},0);return()=>window.clearTimeout(timer);},[globalSearch]);
  useEffect(()=>{const timer=window.setTimeout(()=>{setTerm(search.trim());setPage(0);},300);return()=>window.clearTimeout(timer);},[search]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),12000);
    queueMicrotask(()=>{if(active) setState("loading");});
    async function load() {
      try {
        const api=client();
        let request=api.from("crm_leads").select(leadFields,{count:"exact"}).order("updated_at",{ascending:false}).order("id").range(page*50,page*50+49).abortSignal(controller.signal);
        request=archived ? request.not("archived_at","is",null) : request.is("archived_at",null);
        if(term) request=request.ilike("search_text",`%${escapeCrmSearch(term)}%`);
        if(stage!=="all") request=request.eq("stage",stage);
        if(onlyDue) request=request.lte("next_follow_up_at",new Date().toISOString()).not("stage","in","(won,lost)");
        const [list,summary,people]=await Promise.all([request,api.rpc("crm_metrics",{search_term:term,archived}).abortSignal(controller.signal),api.rpc("crm_list_assignees").abortSignal(controller.signal)]);
        if(!active) return;
        if(list.error||summary.error||people.error||!summary.data) throw new Error("CRM indisponible");
        setRows((list.data??[]) as unknown as CrmLead[]);setTotal(list.count??0);setMetrics(summary.data as Metrics);setAssignees((people.data??[]) as Assignee[]);setState("ready");
      } catch {if(active){setRows([]);setMetrics(null);setState("error");}}
      finally {window.clearTimeout(timer);}
    }
    void load();return()=>{active=false;controller.abort();window.clearTimeout(timer);};
  },[term,stage,archived,onlyDue,page,revision]);
  const refresh=()=>setRevision(value=>value+1);
  return <section className="workspace-content crm-workspace" aria-label="CRM commercial">
    <div className="workspace-intro"><div><h2>{dueOnly ? "Relances commerciales" : "CRM commercial"}</h2><p>{canAssign ? "Vue de tous les prospects et affectation de l’équipe commerciale." : "Vos prospects, contacts, rendez-vous et prochaines actions."}</p></div><button className="crm-primary" type="button" onClick={()=>setSelected("new")}>＋ Ajouter un prospect</button></div>
    <div className="workspace-metrics"><article><span>Prospects {archived?"archivés":"actifs"}</span><strong>{metrics?.total??"—"}</strong><small>Tous les résultats autorisés de la recherche</small></article><article><span>Relances à échéance</span><strong>{metrics?.due??"—"}</strong><small>Échéance atteinte, hors gagnés et perdus</small></article><article><span>Gagnés</span><strong>{metrics?(metrics.stages.won??0):"—"}</strong><small>Statut commercial ; validation du dossier séparée</small></article></div>
    <article className="workspace-panel crm-filters"><label>Rechercher un prospect<input type="search" value={search} maxLength={160} placeholder="Salon, contact, téléphone, email, ville…" onChange={event=>setSearch(event.target.value)} /></label><label className="crm-check"><input type="checkbox" checked={onlyDue} disabled={archived} onChange={event=>{setOnlyDue(event.target.checked);setPage(0);}} /> Relances à échéance</label><label className="crm-check"><input type="checkbox" checked={archived} onChange={event=>{setArchived(event.target.checked);if(event.target.checked)setOnlyDue(false);setPage(0);setSelected(null);}} /> Archives</label><button type="button" onClick={refresh}>Actualiser</button></article>
    <nav className="crm-pipeline" aria-label="Étapes du pipeline"><button type="button" aria-pressed={stage==="all"} onClick={()=>{setStage("all");setPage(0);}}>Tous <strong>{metrics?.total??"—"}</strong></button>{crmStages.map(key=><button type="button" key={key} aria-pressed={stage===key} onClick={()=>{setStage(key);setPage(0);}}>{crmStageLabels[key]} <strong>{metrics?(metrics.stages[key]??0):"—"}</strong></button>)}</nav>
    <div className="crm-layout"><article className="workspace-panel crm-list"><h3>Prospects {state==="ready"?`(${total})`:""}</h3>
      {state==="loading"?<p role="status">Chargement du CRM…</p>:state==="error"?<p role="alert">Le CRM est indisponible. Vérifiez votre accès commercial et votre session MFA, puis actualisez.</p>:!rows.length?<p>Aucun prospect dans cette vue.</p>:rows.map(row=><button className={`crm-lead ${typeof selected==="object"&&selected?.id===row.id?"selected":""}`} type="button" key={row.id} onClick={()=>setSelected(row)}><strong>{row.name}</strong><span>{row.contact_name||"Contact à renseigner"} · {row.city||"Ville à renseigner"}</span><span>{crmStageLabels[row.stage]} · {assignees.find(person=>person.id===row.assigned_to)?.label??"Commercial affecté"}</span><small className={isCrmFollowUpDue(row)?"crm-due":""}>Relance : {when(row.next_follow_up_at)}</small></button>)}
      <div className="crm-pagination"><button type="button" disabled={state!=="ready"||page===0} onClick={()=>setPage(value=>value-1)}>Précédent</button><span>Page {page+1}</span><button type="button" disabled={state!=="ready"||(page+1)*50>=total} onClick={()=>setPage(value=>value+1)}>Suivant</button></div>
    </article>{selected?<CrmEditor key={selected==="new"?"new":`${selected.id}-${selected.version}`} lead={selected==="new"?null:selected} canAssign={canAssign} assignees={assignees} userId={userId} onClose={()=>setSelected(null)} onSaved={next=>{setSelected(next);refresh();}} />:<article className="workspace-panel"><h3>Fiche prospect</h3><p>Sélectionnez un prospect ou ajoutez-en un nouveau pour suivre les échanges et les relances.</p></article>}</div>
  </section>;
}

function CrmEditor({lead,canAssign,assignees,userId,onClose,onSaved}:{lead:CrmLead|null;canAssign:boolean;assignees:Assignee[];userId:string;onClose:()=>void;onSaved:(lead:CrmLead)=>void}) {
  const [stage,setStage]=useState(lead?.stage??"new"),[linked,setLinked]=useState(lead?.linked_provider_id??null);
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(""),[activities,setActivities]=useState<CrmActivity[]>([]),[historyPage,setHistoryPage]=useState(0),[historyState,setHistoryState]=useState("loading"),[historyRevision,setHistoryRevision]=useState(0);
  const [providerSearch,setProviderSearch]=useState(""),[providers,setProviders]=useState<{profile_id:string;business_name:string;city:string;status:string}[]>([]);
  const inFlight=useRef(false);
  useEffect(()=>{
    if(!lead) return;let active=true;const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),12000);
    queueMicrotask(()=>{if(active)setHistoryState("loading");});
    void Promise.resolve(client().from("crm_activities").select("id,lead_id,kind,body,actor_name,created_at").eq("lead_id",lead.id).order("created_at",{ascending:false}).order("id").range(historyPage*25,historyPage*25+24).abortSignal(controller.signal)).then(result=>{if(!active)return;if(result.error){setHistoryState("error");return;}setActivities((result.data??[]) as CrmActivity[]);setHistoryState("ready");}).catch(()=>{if(active)setHistoryState("error");}).finally(()=>window.clearTimeout(timer));
    return()=>{active=false;controller.abort();window.clearTimeout(timer);};
  },[lead,historyPage,historyRevision]);
  async function run(action:()=>Promise<void>) {if(inFlight.current)return;inFlight.current=true;setBusy(true);setFeedback("");try{await action();}catch{setFeedback("Action non confirmée. La fiche a peut-être changé ou votre accès a été retiré. Actualisez le CRM et rouvrez-la avant de réessayer.");}finally{inFlight.current=false;setBusy(false);}}
  async function reloadLead() {if(!lead)return;const result=await client().from("crm_leads").select(leadFields).eq("id",lead.id).maybeSingle();if(result.error||!result.data)throw new Error("stale");onSaved(result.data as unknown as CrmLead);}
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);
    let instant:string|null=null;try{const next=String(data.get("followUp")??"");instant=next?new Date(next).toISOString():null;}catch{setFeedback("Vérifiez la date de relance.");return;}
    const parsed=crmLeadInput.safeParse({name:String(data.get("name")??""),contact_name:String(data.get("contact_name")??""),email:String(data.get("email")??"").trim()||null,phone:String(data.get("phone")??""),city:String(data.get("city")??""),address:String(data.get("address")??""),source:String(data.get("source")??""),stage,lost_reason:String(data.get("lost_reason")??""),next_follow_up_at:instant,linked_provider_id:linked});
    if(!parsed.success){setFeedback("Vérifiez les champs. Le nom du salon est obligatoire et un prospect perdu doit avoir un motif.");return;}
    await run(async()=>{const request=lead?client().from("crm_leads").update(parsed.data).eq("id",lead.id).eq("version",lead.version):client().from("crm_leads").insert(parsed.data);const result=await request.select(leadFields).maybeSingle();if(result.error||!result.data)throw new Error("stale");onSaved(result.data as unknown as CrmLead);});
  }
  async function archive() {if(!lead||!window.confirm(lead.archived_at?"Restaurer ce prospect ?":"Archiver ce prospect ? Son historique sera conservé."))return;await run(async()=>{const result=await client().from("crm_leads").update({archived_at:lead.archived_at?null:new Date().toISOString()}).eq("id",lead.id).eq("version",lead.version).select(leadFields).maybeSingle();if(result.error||!result.data)throw new Error("stale");onSaved(result.data as unknown as CrmLead);});}
  async function addActivity(event:FormEvent<HTMLFormElement>) {event.preventDefault();if(!lead)return;const form=event.currentTarget;const data=new FormData(form);const body=String(data.get("body")??"").trim();if(!body)return;await run(async()=>{const result=await client().from("crm_activities").insert({lead_id:lead.id,kind:String(data.get("kind")??"note"),body});if(result.error)throw result.error;form.reset();setHistoryPage(0);setHistoryRevision(value=>value+1);setFeedback("Activité enregistrée dans le suivi.");});}
  async function assign(event:FormEvent<HTMLFormElement>) {event.preventDefault();if(!lead)return;const target=String(new FormData(event.currentTarget).get("assignee"));if(target===lead.assigned_to)return;await run(async()=>{const result=await client().rpc("crm_assign_lead",{target_lead:lead.id,target_version:lead.version,target_assignee:target});if(result.error)throw result.error;await reloadLead();});}
  async function findProvider() {await run(async()=>{const result=await client().rpc("crm_find_professionals",{search_term:providerSearch.trim()});if(result.error)throw result.error;setProviders(result.data??[]);if(!result.data?.length)setFeedback("Aucun dossier trouvé. Essayez le nom du salon ou sa ville.");});}
  const disabled=busy||Boolean(lead?.archived_at), defaults=lead??emptyCrmLead;
  return <article className="workspace-panel crm-editor"><header><div><h3>{lead?lead.name:"Nouveau prospect"}</h3>{lead&&<small>{lead.assigned_to===userId?"Votre prospect":assignees.find(person=>person.id===lead.assigned_to)?.label??"Commercial affecté"} · Mise à jour {when(lead.updated_at)}</small>}</div><button type="button" onClick={onClose} disabled={busy}>Fermer</button></header>
    {feedback&&<p role="status" className="crm-feedback">{feedback}</p>}{lead?.archived_at&&<p role="status">Ce prospect est archivé. Restaurez-le pour reprendre son suivi.</p>}
    <form className="crm-form" onSubmit={event=>void save(event)}>
      <label>Salon ou établissement<input name="name" required minLength={2} maxLength={160} defaultValue={defaults.name} disabled={disabled}/></label><label>Personne à contacter<input name="contact_name" maxLength={120} defaultValue={defaults.contact_name} disabled={disabled}/></label>
      <label>Téléphone<input name="phone" type="tel" maxLength={40} defaultValue={defaults.phone} disabled={disabled}/></label><label>Email<input name="email" type="email" maxLength={254} defaultValue={defaults.email??""} disabled={disabled}/></label>
      <label>Ville<input name="city" maxLength={100} defaultValue={defaults.city} disabled={disabled}/></label><label>Origine du contact<input name="source" maxLength={80} defaultValue={defaults.source} disabled={disabled}/></label>
      <label className="crm-wide">Adresse<input name="address" maxLength={300} defaultValue={defaults.address} disabled={disabled}/></label>
      <label>Étape<select name="stage" value={stage} onChange={event=>setStage(event.target.value as typeof stage)} disabled={disabled}>{crmStages.map(key=><option key={key} value={key}>{crmStageLabels[key]}</option>)}</select></label>
      <label>Prochaine relance — heure de cet appareil<input name="followUp" type="datetime-local" defaultValue={localInput(defaults.next_follow_up_at)} disabled={disabled}/></label>
      {stage==="lost"&&<label className="crm-wide">Motif de perte<textarea name="lost_reason" required minLength={2} maxLength={1000} defaultValue={defaults.lost_reason} disabled={disabled}/></label>}
      <fieldset className="crm-wide" disabled={disabled}><legend>Dossier professionnel lié</legend><p>Le suivi commercial et la validation professionnelle sont séparés. Lier un dossier ne l’approuve pas.</p>{linked?<><Link href={`/commercial/dossiers?dossier=${encodeURIComponent(linked)}`}>Ouvrir le dossier professionnel</Link><button type="button" onClick={()=>{setLinked(null);setProviders([]);}}>Retirer le lien</button><small>Le lien sera enregistré avec la fiche.</small></>:<><label>Rechercher un salon inscrit<input value={providerSearch} minLength={2} maxLength={160} onChange={event=>setProviderSearch(event.target.value)}/></label><button type="button" disabled={providerSearch.trim().length<2} onClick={()=>void findProvider()}>Rechercher un dossier</button>{providers.map(provider=><button type="button" className="crm-provider" key={provider.profile_id} onClick={()=>{setLinked(provider.profile_id);setProviders([]);}}>{provider.business_name} · {provider.city}</button>)}</>}</fieldset>
      <button className="crm-primary" type="submit" disabled={disabled}>{busy?"Enregistrement…":lead?"Enregistrer la fiche":"Créer le prospect"}</button>
    </form>
    {lead&&<><div className="crm-actions"><button type="button" disabled={busy} onClick={()=>void archive()}>{lead.archived_at?"Restaurer":"Archiver"}</button></div>
      {canAssign&&<form className="crm-form" onSubmit={event=>void assign(event)}><label>Responsable commercial<select name="assignee" defaultValue={lead.assigned_to} disabled={busy}>{assignees.map(person=><option key={person.id} value={person.id}>{person.label}</option>)}</select></label><button type="submit" disabled={busy}>Réaffecter le prospect</button></form>}
      {!lead.archived_at&&<form className="crm-form" onSubmit={event=>void addActivity(event)}><h4 className="crm-wide">Enregistrer un échange</h4><label>Type<select name="kind" disabled={busy}>{["note","call","meeting","email","whatsapp"].map(kind=><option value={kind} key={kind}>{crmActivityLabels[kind]}</option>)}</select></label><label className="crm-wide">Compte rendu<textarea name="body" required maxLength={4000} disabled={busy}/></label><p className="crm-wide">Ce formulaire conserve votre compte rendu ; il n’envoie pas d’email ou de message WhatsApp.</p><button type="submit" disabled={busy}>Ajouter au suivi</button></form>}
      <section className="crm-history" aria-label="Historique du prospect"><h4>Historique</h4>{historyState==="loading"?<p role="status">Chargement de l’historique…</p>:historyState==="error"?<p role="alert">Historique indisponible. Actualisez le CRM.</p>:!activities.length?<p>Aucune activité sur cette page.</p>:activities.map(activity=><article key={activity.id}><strong>{crmActivityLabels[activity.kind]??"Activité"}</strong><small>{activity.actor_name} · {when(activity.created_at)}</small><p>{activity.body}</p></article>)}<div className="crm-pagination"><button type="button" disabled={historyPage===0||historyState!=="ready"} onClick={()=>setHistoryPage(value=>value-1)}>Plus récent</button><button type="button" disabled={activities.length<25||historyState!=="ready"} onClick={()=>setHistoryPage(value=>value+1)}>Plus ancien</button></div></section>
    </>}
  </article>;
}
