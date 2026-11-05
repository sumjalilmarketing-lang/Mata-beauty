import { expect,it } from "vitest";
import { acceptedInvitationMember,teamAccessLabel } from "../../lib/domain/team-access-status";
it("distinguishes a standalone employee record from a usable account",()=>{
 const member={is_active:true,archived_at:null},account={revoked_at:null,permissions:["bookings.read"]};
 expect(teamAccessLabel(member,undefined)).toContain("Fiche seule");
 expect(teamAccessLabel(member,account)).toBe("Espace collaborateur actif");
 expect(teamAccessLabel({...member,is_active:false},account)).toContain("suspendu");
 expect(teamAccessLabel(member,{...account,revoked_at:"2026-11-05"})).toBe("Accès révoqué");
 expect(teamAccessLabel(member,{...account,permissions:[]})).toContain("sans permission");
});
it("links only the accepted invitation's member, not another invitation or its sender",()=>{
 const events=[{invitation_id:"other",event_type:"accepted",collaborator_id:"wrong"},{invitation_id:"invite",event_type:"created",collaborator_id:"wrong"},{invitation_id:"invite",event_type:"accepted",collaborator_id:"member"}];
 expect(acceptedInvitationMember("invite",events)).toBe("member");
 expect(acceptedInvitationMember("unknown",events)).toBeNull();
});
