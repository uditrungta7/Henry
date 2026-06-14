// Date helpers for the scheduling board. Work in ISO date strings (YYYY-MM-DD)
// and local date parts so the day never shifts across timezones.

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return toIso(date);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Monday-of-week for the given ISO date (week is Mon–Sun).
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0 = Sun, 1 = Mon, …
  const backToMonday = (dow + 6) % 7;
  return addDays(iso, -backToMonday);
}

// The 7 ISO dates Mon–Sun for the week containing `iso`.
export function weekDays(iso: string): string[] {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// "Mon Jun 16" — used in the UI and the email subject/body.
export function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// "Mon" / "Jun 16" split for compact week-view headers.
export function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function monthDayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
