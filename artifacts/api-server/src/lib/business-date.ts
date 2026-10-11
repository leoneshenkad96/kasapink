const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function wibDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const roundTrip = new Date(0);
  roundTrip.setUTCHours(0, 0, 0, 0);
  roundTrip.setUTCFullYear(year, month - 1, day);
  return roundTrip.getUTCFullYear() === year
    && roundTrip.getUTCMonth() === month - 1
    && roundTrip.getUTCDate() === day;
}

// Business transactions may be backdated, but never future-dated in WIB.
export function isAllowedBusinessDate(value: unknown, now: Date = new Date()): value is string {
  return isCalendarDate(value) && value <= wibDateKey(now);
}
