import { z } from "zod";
export const crmStages = ["new","contacted","meeting","proposal","onboarding","won","lost"] as const;
export const crmStageLabels: Record<typeof crmStages[number], string> = { new:"À contacter",contacted:"Contacté",meeting:"Rendez-vous",proposal:"Proposition",onboarding:"Inscription en cours",won:"Gagné",lost:"Perdu" };
export const crmActivityLabels: Record<string,string> = { note:"Note",call:"Appel",meeting:"Rendez-vous",email:"Email journalisé",whatsapp:"Échange WhatsApp journalisé",created:"Création",updated:"Mise à jour",assigned:"Réaffectation",archived:"Archivage",restored:"Restauration" };
export const crmLeadInput = z.object({
  name:z.string().trim().min(2).max(160),contact_name:z.string().trim().max(120),
  email:z.email().max(254).toLowerCase().nullable(), phone:z.string().trim().max(40).regex(/^[0-9+(). /-]*$/),
  city:z.string().trim().max(100),address:z.string().trim().max(300),source:z.string().trim().max(80),
  stage:z.enum(crmStages),lost_reason:z.string().trim().max(1000),next_follow_up_at:z.iso.datetime({offset:true}).nullable(),linked_provider_id:z.uuid().nullable(),
}).strict().refine(value => value.stage!=="lost" || value.lost_reason.length>=2,{path:["lost_reason"],message:"Précisez le motif de perte."});
export type CrmLeadInput = z.infer<typeof crmLeadInput>;
export type CrmLead = CrmLeadInput & { id:string;assigned_to:string;created_by:string;created_at:string;updated_at:string;archived_at:string|null;version:number };
export type CrmActivity = {id:string;lead_id:string;kind:string;body:string;actor_name:string;created_at:string};
export const emptyCrmLead:CrmLeadInput = {name:"",contact_name:"",email:null,phone:"",city:"",address:"",source:"Terrain",stage:"new",lost_reason:"",next_follow_up_at:null,linked_provider_id:null};
export function isCrmFollowUpDue(lead:Pick<CrmLead,"stage"|"archived_at"|"next_follow_up_at">,now=Date.now()) {
  return !lead.archived_at && !["won","lost"].includes(lead.stage) && lead.next_follow_up_at!==null && new Date(lead.next_follow_up_at).getTime()<=now;
}
export function escapeCrmSearch(value:string) {return value.replace(/[\\%_]/g,"\\$&");}
