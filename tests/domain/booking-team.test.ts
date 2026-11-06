import {expect,it} from 'vitest';
import {bookingTeamPeople,selectedTeamSlots,type BookingTeamPerson} from '../../lib/domain/booking-team';
const lisa:BookingTeamPerson={collaborator_id:'lisa',display_name:'Lisa',title:'Coiffeuse',avatar_url:null,specialties:['Tresses']};
const aida:BookingTeamPerson={...lisa,collaborator_id:'aida',display_name:'Aïda'};
const slots=[{...aida,slot_start:'2026-11-09T10:00:00Z'},{...lisa,slot_start:'2026-11-09T11:00:00Z'}];
it('keeps Lisa selectable even on a fully booked day',()=>{
 expect(bookingTeamPeople([lisa,aida],[])).toEqual([lisa,aida]);
 expect(selectedTeamSlots([slots[0]],'lisa')).toEqual([]);
});
it('shows only the chosen calendar and pools calendars without a preference',()=>{
 expect(selectedTeamSlots(slots,'lisa')).toEqual([slots[1]]);
 expect(selectedTeamSlots(slots,'')).toEqual(slots);
 expect(selectedTeamSlots(slots,'removed')).toEqual([]);
});
it('supports old availability responses during deployment without overriding an empty roster',()=>{
 expect(bookingTeamPeople(undefined,[...slots,slots[0]])).toHaveLength(2);
 expect(bookingTeamPeople([],slots)).toEqual([]);
});
