import { calculateBookingEnd } from "./booking";
import { isIanaTimeZone, localWallTimeToInstants } from "./time-zone";

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
  timeZone?: string;
};

function parseClock(clock: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) throw new Error(`Horaire invalide : ${clock}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Horaire invalide : ${clock}`);
  return hours * 60 + minutes;
}

function localDateParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Date invalide.");
  const [year, month, day] = match.slice(1).map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day, 12));
  if (instant.getUTCFullYear() !== year || instant.getUTCMonth() + 1 !== month || instant.getUTCDate() !== day) throw new Error("Date invalide.");
  return { year, month, day, weekday: instant.getUTCDay() };
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
  timeZone = "Africa/Dakar",
}: GenerateSlotsInput) {
  const { year, month, day, weekday } = localDateParts(date);
  if (!isIanaTimeZone(timeZone)) throw new Error(`Fuseau IANA invalide : ${timeZone}`);
  const earliestStart = new Date(now.getTime() + minimumNoticeMinutes * 60_000);
  const slots: TimeRange[] = [];

  for (const rule of rules.filter((item) => item.weekday === weekday)) {
    const opensMinute = parseClock(rule.startsAt);
    const closesMinute = parseClock(rule.endsAt);
    if (opensMinute >= closesMinute || !Number.isInteger(rule.intervalMinutes) || rule.intervalMinutes < 15) continue;
    const closingInstants = localWallTimeToInstants({ year, month, day, hour: Math.floor(closesMinute / 60), minute: closesMinute % 60 }, timeZone);
    if (!closingInstants.length) continue;
    const closesAt = closingInstants[closingInstants.length - 1];

    for (let localMinute = opensMinute; localMinute < closesMinute; localMinute += rule.intervalMinutes) {
      const starts = localWallTimeToInstants({ year, month, day, hour: Math.floor(localMinute / 60), minute: localMinute % 60 }, timeZone);
      for (const cursor of starts) {
        const serviceEnd = calculateBookingEnd(cursor, durationMinutes);
        const bufferedRange = { startsAt: cursor, endsAt: new Date(serviceEnd.getTime() + bufferMinutes * 60_000) };
        if (cursor < earliestStart || bufferedRange.endsAt > closesAt) continue;
        if (blockedRanges.some((range) => overlaps(bufferedRange, range))) continue;
        slots.push({ startsAt: cursor, endsAt: serviceEnd });
      }
    }
  }

  return slots.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}
