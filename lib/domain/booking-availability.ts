import { z } from "zod";

const slotStart = z.iso.datetime({ offset: true });
const person = z.object({
  collaborator_id: z.uuid(),
  display_name: z.string(),
  title: z.string().nullable(),
  avatar_url: z.string().nullable(),
  specialties: z.array(z.string()),
});

/** Reject malformed RPC data before rendering dates or selecting a practitioner. */
export const bookingAvailabilitySchema = z.discriminatedUnion("teamEnabled", [
  z.object({
    teamEnabled: z.literal(true),
    blockedReason: z.string().optional(),
    people: z.array(person).optional(),
    slots: z.array(person.extend({ slot_start: slotStart })),
  }),
  z.object({
    teamEnabled: z.literal(false),
    blockedReason: z.string().optional(),
    slots: z.array(z.object({ slot_start: slotStart })),
  }),
]);
