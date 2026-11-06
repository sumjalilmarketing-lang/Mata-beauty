import {expect,it} from "vitest";
import {serviceReference,CUSTOM_SERVICE_NAME} from "../../lib/domain/service-reference";
import {serviceDetailsError} from "../../lib/domain/service-creation";
const id="11111111-1111-4111-8111-111111111111",catalog=[{id,name:CUSTOM_SERVICE_NAME}];
it("saves a freely typed unfamiliar service without a catalogue selection",()=>{
 const serviceId=serviceReference("",catalog);
 expect(serviceId).toBe(id);
 expect(serviceDetailsError({serviceId,title:"Rituel capillaire traditionnel personnalisé",durationMinutes:47,priceAmount:12000})).toBeNull();
});
it("preserves an explicit suggestion and fails validation when the neutral reference is missing",()=>{
 expect(serviceReference("chosen",catalog)).toBe("chosen");
 expect(serviceReference("",[])).toBe("");
 expect(serviceDetailsError({serviceId:serviceReference("",[]),title:"Soin libre",durationMinutes:30,priceAmount:1000})).not.toBeNull();
});
