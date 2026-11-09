import { z } from "zod";

export const clientRescheduleInput = z.object({ bookingId: z.uuid(), startsAt: z.iso.datetime({ offset: true }) }).strict();
export const clientRescheduleQuery = z.object({ bookingId: z.uuid(), date: z.iso.date() }).strict();
export const clientRescheduleResult = z.object({ id: z.uuid(), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }) });
export const clientRescheduleSlots = z.array(z.object({ slot_start: z.iso.datetime({ offset: true }) }));
export type ClientRescheduleResult = z.infer<typeof clientRescheduleResult>;
