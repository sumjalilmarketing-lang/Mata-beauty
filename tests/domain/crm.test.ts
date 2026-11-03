import { expect,it } from "vitest";
import { crmLeadInput,emptyCrmLead,isCrmFollowUpDue } from "@/lib/domain/crm";
it("validates prospect input and prevents adding privilege fields",()=>{
  expect(crmLeadInput.safeParse({...emptyCrmLead,name:"Salon test"}).success).toBe(true);
  expect(crmLeadInput.safeParse({...emptyCrmLead,name:"Salon test",assigned_to:"someone"}).success).toBe(false);
  expect(crmLeadInput.safeParse({...emptyCrmLead,name:"Salon test",phone:"<script>"}).success).toBe(false);
  expect(crmLeadInput.safeParse({...emptyCrmLead,name:"Salon test",stage:"lost",lost_reason:""}).success).toBe(false);
});
it("does not include archived, won, lost or future prospects in overdue follow-ups",()=>{
  const lead={stage:"new" as const,archived_at:null,next_follow_up_at:"2026-11-01T00:00:00Z"};const now=Date.parse("2026-11-03T00:00:00Z");
  expect(isCrmFollowUpDue(lead,now)).toBe(true);
  for(const stage of ["won","lost"] as const) expect(isCrmFollowUpDue({...lead,stage},now)).toBe(false);
  expect(isCrmFollowUpDue({...lead,archived_at:lead.next_follow_up_at},now)).toBe(false);
  expect(isCrmFollowUpDue({...lead,next_follow_up_at:"2026-12-01T00:00:00Z"},now)).toBe(false);
});
