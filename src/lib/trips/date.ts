/**
 * Trip dates are calendar days, not instants. Postgres `date` columns ignore
 * time, but a JS Date built from local midnight serializes as the previous day
 * in any timezone ahead of UTC (IST is UTC+5:30), so build the day at UTC noon
 * and compare on the same basis everywhere.
 */
export function calendarDay(input: Date | string): Date {
  const d = typeof input === "string" ? new Date(`${input}T00:00:00Z`) : input;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
}

export function todayCalendarDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0));
}

/** Format a `@db.Date` value without letting the local timezone shift the day. */
export function formatTripDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}
