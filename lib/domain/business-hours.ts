export type WeeklyBusinessHour = {
  weekday: number;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

export function hasPublishedBusinessHours(hours: readonly WeeklyBusinessHour[]): boolean {
  return hours.some((hour) => !hour.is_closed && Boolean(hour.opens_at && hour.closes_at));
}

export function validateWeeklyBusinessHours(hours: readonly WeeklyBusinessHour[]): string | null {
  const openHours = hours.filter((hour) => !hour.is_closed);
  if (openHours.length === 0) return "Ajoutez au moins un jour d’ouverture.";
  if (openHours.some((hour) => !hour.opens_at || !hour.closes_at || hour.opens_at >= hour.closes_at)) {
    return "Chaque jour ouvert doit avoir une heure de fermeture après l’ouverture.";
  }
  return null;
}

export function hasReservableServiceSchedule(input: {
  serviceId: string;
  teamBookingEnabled: boolean;
  providerAvailabilityPublished: boolean;
  teamServiceIds: readonly string[];
}): boolean {
  return input.teamBookingEnabled
    ? input.teamServiceIds.includes(input.serviceId)
    : input.providerAvailabilityPublished;
}
