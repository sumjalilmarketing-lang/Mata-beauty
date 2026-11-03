import {z} from "zod";
export const departments=["commercial","finance","support"]as const;
export type Department=typeof departments[number];
export const departmentLabels:Record<Department,string>={commercial:"Commercial",finance:"Finance",support:"Service client"};
export const caseStatuses={open:"À traiter",in_progress:"En cours",waiting:"En attente",completed:"Terminé"}as const;
const reason=z.string().trim().min(2).max(1000),teamId=z.uuid(),email=z.email().max(254).transform(v=>v.toLowerCase());
export const departmentTeamInput=z.discriminatedUnion("action",[
 z.object({action:z.literal("commercial-team"),name:z.string().trim().min(2).max(120),reason}).strict(),
 z.object({action:z.literal("team"),teamId:teamId.nullable(),version:z.number().int().positive().nullable(),department:z.enum(departments),name:z.string().trim().min(2).max(120),managerEmail:email,enabled:z.boolean(),reason}).strict(),
 z.object({action:z.literal("member"),teamId,email,reason}).strict(),
 z.object({action:z.literal("access"),teamId,userId:z.uuid(),change:z.enum(["suspend","reactivate","revoke"]),reason}).strict(),
 z.object({action:z.literal("invite"),teamId,email,firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),channel:z.enum(["email","link"]).default("email")}).strict(),
 z.object({action:z.enum(["resend","link","cancel"]),teamId,invitationId:z.uuid()}).strict(),
]);
export type DepartmentTeam={id:string;name:string;department:Department;manager_id:string;manager_email:string;manager_name:string|null;is_active:boolean;version:number};
export type DepartmentMember={team_id:string;user_id:string;email:string;display_name:string|null;status:"active"|"suspended"|"revoked"};
export type DepartmentInvitation={id:string;team_id:string;email:string;status:string;expires_at:string;sent_at:string|null};
export type DepartmentContext={is_super:boolean;teams:DepartmentTeam[];members:DepartmentMember[];invitations:DepartmentInvitation[]};
export type MyDepartmentTeam={id:string;name:string;department:Department;is_manager:boolean};
export type DepartmentCase={id:string;team_id:string;assigned_to:string;title:string;details:string;status:keyof typeof caseStatuses;provider_id:string|null;ticket_id:string|null;payment_id:string|null;due_at:string|null;version:number;updated_at:string};
