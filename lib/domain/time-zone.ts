export type ZonedWallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
};

const partsFormatter = new Map<string, Intl.DateTimeFormat>();

export function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function formatter(timeZone: string) {
  let value = partsFormatter.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsFormatter.set(timeZone, value);
  }
  return value;
}

export function zonedWallTimeAt(instant: Date, timeZone: string): ZonedWallTime {
  if (!Number.isFinite(instant.getTime()) || !isIanaTimeZone(timeZone)) throw new Error("Instant ou fuseau IANA invalide.");
  const values = Object.fromEntries(formatter(timeZone).formatToParts(instant).map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

function sameWallTime(left: ZonedWallTime, right: ZonedWallTime) {
  return left.year === right.year && left.month === right.month && left.day === right.day
    && left.hour === right.hour && left.minute === right.minute && (left.second ?? 0) === (right.second ?? 0);
}

/**
 * Resolve a local wall-clock value to UTC instants. A DST gap returns no values;
 * a repeated fall-back time returns both instants in chronological order.
 */
export function localWallTimeToInstants(wallTime: ZonedWallTime, timeZone: string): Date[] {
  if (!isIanaTimeZone(timeZone)) throw new Error(`Fuseau IANA invalide : ${timeZone}`);
  const { year, month, day, hour, minute, second = 0 } = wallTime;
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(target);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day
      || hour > 23 || minute > 59 || second > 59 || hour < 0 || minute < 0 || second < 0) {
    throw new Error("Date ou heure locale invalide.");
  }

  const offsets = new Set<number>();
  for (const deltaHours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(target + deltaHours * 3_600_000);
    const local = zonedWallTimeAt(sample, timeZone);
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second ?? 0);
    offsets.add(localAsUtc - Math.floor(sample.getTime() / 1000) * 1000);
  }

  return [...offsets]
    .map((offset) => new Date(target - offset))
    .filter((candidate) => sameWallTime(zonedWallTimeAt(candidate, timeZone), wallTime))
    .sort((left, right) => left.getTime() - right.getTime());
}

/** Convert a datetime-local input to a real UTC instant in the business zone. */
export function localDateTimeInputToInstant(
  value: string,
  timeZone: string,
  boundary: "start" | "end" = "start",
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Date et heure locale invalides.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText);
  const choices = localWallTimeToInstants({ year, month, day, hour, minute }, timeZone);
  if (!choices.length) throw new Error("Cette heure locale n’existe pas au changement d’heure. Choisissez un autre horaire.");
  return boundary === "start" ? choices[0] : choices[choices.length - 1];
}

export function formatInstantInTimeZone(instant: Date, timeZone: string, locale = "fr-FR") {
  if (!isIanaTimeZone(timeZone)) throw new Error(`Fuseau IANA invalide : ${timeZone}`);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(instant);
}

export function localDateAt(instant: Date, timeZone: string): string {
  const parts = zonedWallTimeAt(instant, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatWallDate(date: string, locale = "fr-FR") {
  const { year, month, day } = parseLocalDate(date);
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function addCalendarDays(date: string, count: number): string {
  if (!Number.isInteger(count)) throw new Error("Le nombre de jours doit être un entier.");
  const { year, month, day } = parseLocalDate(date);
  const result = new Date(Date.UTC(year, month - 1, day + count, 12));
  return `${String(result.getUTCFullYear()).padStart(4, "0")}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

export function parseLocalDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("Date invalide.");
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) throw new Error("Date invalide.");
  return { year, month, day };
}
