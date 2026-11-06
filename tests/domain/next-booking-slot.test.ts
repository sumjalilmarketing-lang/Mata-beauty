import {it,expect} from 'vitest';
import {nextBookingDate} from '../../lib/domain/next-booking-slot';
it('finds a future date in the establishment timezone',()=>{
 expect(nextBookingDate([{slot_start:'2026-11-08T00:30:00Z'}],'America/New_York',false)).toBe('2026-11-07');
});
it('keeps the chosen collaborator when searching another date',()=>{
 const rows=[{slot_start:'2026-11-08T10:00:00Z',collaborator_id:'aida'},{slot_start:'2026-11-10T10:00:00Z',collaborator_id:'lisa'}];
 expect(nextBookingDate(rows,'Africa/Dakar',true,'lisa')).toBe('2026-11-10');
 expect(nextBookingDate(rows,'Africa/Dakar',true,'unknown')).toBeNull();
 expect(nextBookingDate(rows,'Africa/Dakar',true,'')).toBe('2026-11-08');
});
it('does not invent availability for empty or invalid results',()=>{
 expect(nextBookingDate([],'Africa/Dakar',false)).toBeNull();
 expect(nextBookingDate([{slot_start:'bad'}],'Africa/Dakar',false)).toBeNull();
});
