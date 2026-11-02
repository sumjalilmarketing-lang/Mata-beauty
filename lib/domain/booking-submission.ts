export class BookingSlotConflict extends Error {
  constructor() { super("Ce créneau vient d’être réservé."); this.name = "BookingSlotConflict"; }
}

export function bookingSubmissionError(error: unknown): "conflict" | "unknown" {
  return error instanceof BookingSlotConflict ? "conflict" : "unknown";
}
