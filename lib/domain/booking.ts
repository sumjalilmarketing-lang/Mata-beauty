export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "declined",
  "cancelled_by_client",
  "cancelled_by_provider",
  "in_progress",
  "completed",
  "no_show",
  "disputed",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const transitions: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  pending: ["confirmed", "declined", "cancelled_by_client", "cancelled_by_provider"],
  confirmed: ["cancelled_by_client", "cancelled_by_provider", "in_progress", "no_show", "disputed"],
  declined: [],
  cancelled_by_client: [],
  cancelled_by_provider: [],
  in_progress: ["completed", "disputed"],
  completed: ["disputed"],
  no_show: ["disputed"],
  disputed: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus) {
  return transitions[from].includes(to);
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus) {
  if (!canTransitionBooking(from, to)) {
    throw new Error(`Transition de réservation interdite : ${from} → ${to}`);
  }
}

export function calculateBookingQuote(serviceAmount: number, travelFee = 0) {
  if (!Number.isInteger(serviceAmount) || serviceAmount < 0) {
    throw new Error("Le prix de la prestation doit être un entier positif en FCFA.");
  }
  if (!Number.isInteger(travelFee) || travelFee < 0) {
    throw new Error("Les frais de déplacement doivent être un entier positif en FCFA.");
  }
  return {
    serviceAmount,
    travelFee,
    totalAmount: serviceAmount + travelFee,
    currency: "XOF" as const,
  };
}

export function calculateBookingEnd(start: Date, durationMinutes: number) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) {
    throw new Error("La durée doit être comprise entre 15 et 720 minutes.");
  }
  return new Date(start.getTime() + durationMinutes * 60_000);
}

export function canClientCancel(startsAt: Date, now = new Date(), minimumNoticeHours = 24) {
  return startsAt.getTime() - now.getTime() >= minimumNoticeHours * 3_600_000;
}
