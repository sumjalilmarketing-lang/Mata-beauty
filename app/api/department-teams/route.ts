import {createSupabaseServerClient} from "@/lib/supabase/server";
import {applicationOrigin} from "@/lib/payments/server";
import {departmentTeamInput} from "@/lib/domain/department-teams";
import {deliverDepartmentInvitation} from "@/lib/teams/delivery";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function manager(request:Request){const client=await createSupabaseServerClient(request);const{data,error}=await client.auth.getUser();if(error||!data.user)return null;const context=await client.rpc("department_context");return context.error?null:{client,context:context.data};}
export async function GET(request:Request){const auth=await manager(request);return auth?reply(auth.context):reply({error:"Accès responsable refusé. Vérifiez votre session MFA."},403);}
export async function POST(request:Request){
 if(request.headers.get("origin")!==new URL(applicationOrigin(request)).origin)return reply({error:"Origine refusée."},403);
 const auth=await manager(request);if(!auth)return reply({error:"Accès responsable refusé. Vérifiez votre session MFA."},403);
 const parsed=departmentTeamInput.safeParse(await request.json().catch(()=>null));if(!parsed.success)return reply({error:"Vérifiez les informations saisies."},400);const v=parsed.data;
 if(v.action==="team"){const r=await auth.client.rpc("department_set_team",{target_team:v.teamId,target_version:v.version,target_department:v.department,target_name:v.name,manager_email:v.managerEmail,enabled:v.enabled,reason:v.reason});return r.error?reply({error:"Délégation refusée. Utilisez un autre compte confirmé actif sans rôle incompatible et actualisez l’équipe."},409):reply({ok:true,id:r.data});}
 if(v.action==="member"){const r=await auth.client.rpc("department_add_member",{target_team:v.teamId,target_email:v.email,reason:v.reason});return r.error?reply({error:"Ajout refusé. Le compte doit être confirmé, actif et sans autre accès interne. Un transfert doit être traité par le Super Admin."},409):reply({ok:true,id:r.data});}
 if(v.action==="access"){const r=await auth.client.rpc("department_member_action",{target_team:v.teamId,target_user:v.userId,target_action:v.change,reason:v.reason});return r.error?reply({error:"Modification refusée. Actualisez l’équipe et vérifiez le statut du membre."},409):reply({ok:true});}
 if(v.action==="cancel"){const r=await auth.client.rpc("department_revoke_invitation",{target_team:v.teamId,target_invitation:v.invitationId});return r.error?reply({error:"Retrait refusé. Actualisez les invitations."},409):reply({ok:true});}
 if(v.action!=="link"&&!(v.action==="invite"&&v.channel==="link")&&!process.env.RESEND_API_KEY)return reply({error:"Service d’envoi indisponible. Choisissez le partage d’un lien."},503);
 let invitationId:string;
 if(v.action==="invite"){const r=await auth.client.rpc("department_prepare_invitation",{target_team:v.teamId,target_email:v.email,given_name:v.firstName,family_name:v.lastName});if(r.error||typeof r.data!=="string")return reply({error:"Invitation refusée : vérifiez l’équipe et l’absence de compte ou d’invitation existante. Pour un compte déjà créé, utilisez Ajouter un compte existant."},409);invitationId=r.data;}
 else{const r=await auth.client.rpc("department_resend_invitation",{target_team:v.teamId,target_invitation:v.invitationId});if(r.error)return reply({error:"Invitation inaccessible ou dernier envoi trop récent. Attendez une minute et actualisez."},409);invitationId=v.invitationId;}
 try{return reply({ok:true,...await deliverDepartmentInvitation(auth.client,request,v.teamId,invitationId,v.action!=="link"&&!(v.action==="invite"&&v.channel==="link"))});}
 catch{return reply({error:"La préparation ou l’envoi n’a pas pu être confirmé. Actualisez les invitations ; vous pourrez réessayer ou copier un lien après une minute."},503);}
}
