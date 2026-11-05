export const HOUSEHOLD_TIME_ZONE = "Europe/Warsaw";

export type ExpiryState = "none" | "expired" | "today" | "soon" | "ok";

export function warsawDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HOUSEHOLD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Could not format the Warsaw calendar date");
  }
  return `${year}-${month}-${day}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  const nextYear = utc.getUTCFullYear();
  const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(utc.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function daysUntil(expiresOn: string, today: string): number {
  const start = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const end = Date.UTC(
    Number(expiresOn.slice(0, 4)),
    Number(expiresOn.slice(5, 7)) - 1,
    Number(expiresOn.slice(8, 10)),
  );
  return Math.round((end - start) / 86_400_000);
}

export function expiryState(expiresOn: string | null, today: string): ExpiryState {
  if (!expiresOn) return "none";
  if (expiresOn < today) return "expired";
  if (expiresOn === today) return "today";
  if (expiresOn <= addCalendarDays(today, 2)) return "soon";
  return "ok";
}
