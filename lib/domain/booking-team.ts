export type BookingTeamPerson = {
  collaborator_id: string;
  display_name: string;
  title: string | null;
  avatar_url: string | null;
  specialties: string[];
};
export type BookingTeamSlot = BookingTeamPerson & { slot_start: string };

/** Preserve the qualified roster even when no one has a free slot that day. */
export function bookingTeamPeople(people: BookingTeamPerson[] | undefined, slots: BookingTeamSlot[]): BookingTeamPerson[] {
  return [...new Map((people ?? slots).map(person => [person.collaborator_id, person])).values()];
}

/** A named choice never falls back to a colleague's calendar. */
export function selectedTeamSlots(slots: BookingTeamSlot[], collaboratorId: string): BookingTeamSlot[] {
  return slots.filter(slot => !collaboratorId || slot.collaborator_id === collaboratorId);
}
