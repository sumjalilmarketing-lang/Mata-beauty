import { calculateBookingEnd } from "./booking";

export type AvailabilityRule = {
  weekday: number;
  startsAt: string;
  endsAt: string;
  intervalMinutes: number;
};

export type TimeRange = {
  startsAt: Date;
  endsAt: Date;
};

type GenerateSlotsInput = {
  date: string;
  durationMinutes: number;
  rules: readonly AvailabilityRule[];
  blockedRanges?: readonly TimeRange[];
  now?: Date;
  minimumNoticeMinutes?: number;
  bufferMinutes?: number;
};

function parseClock(date: string, clock: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) throw new Error(`Horaire invalide : ${clock}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Horaire invalide : ${clock}`);
  // Africa/Dakar is UTC+00 year-round. Keeping this explicit avoids host-timezone drift.
  return new Date(`${date}T${clock}:00.000Z`);
}

function overlaps(left: TimeRange, right: TimeRange) {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function generateAvailableSlots({
  date,
  durationMinutes,
  rules,
  blockedRanges = [],
  now = new Date(),
  minimumNoticeMinutes = 120,
  bufferMinutes = 0,
}: GenerateSlotsInput) {
  const day = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) throw new Error("Date invalide.");
  const weekday = day.getUTCDay();
  const earliestStart = new Date(now.getTime() + minimumNoticeMinutes * 60_000);
  const slots: TimeRange[] = [];

  for (const rule of rules.filter((item) => item.weekday === weekday)) {
    const opensAt = parseClock(date, rule.startsAt);
    const closesAt = parseClock(date, rule.endsAt);
    if (opensAt >= closesAt || rule.intervalMinutes < 15) continue;

    for (
      let cursor = opensAt;
      cursor < closesAt;
      cursor = new Date(cursor.getTime() + rule.intervalMinutes * 60_000)
    ) {
      const serviceEnd = calculateBookingEnd(cursor, durationMinutes);
      const bufferedRange = {
        startsAt: cursor,
        endsAt: new Date(serviceEnd.getTime() + bufferMinutes * 60_000),
      };
      if (cursor < earliestStart || bufferedRange.endsAt > closesAt) continue;
      if (blockedRanges.some((range) => overlaps(bufferedRange, range))) continue;
      slots.push({ startsAt: cursor, endsAt: serviceEnd });
    }
  }

  return slots;
}
