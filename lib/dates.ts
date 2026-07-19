// Date helpers for the scheduling board. Work in ISO date strings (YYYY-MM-DD)
// and local date parts so the day never shifts across timezones.

export function isoToday(): string {
  // Local date parts, NOT toISOString(), which is UTC and shifts the day for
  // non-UTC users near midnight (the whole module works in local parts).
  return toIso(new Date());
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

// Sunday-of-week for the given ISO date (week is Sun-Sat, USA convention).
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0 = Sun, 1 = Mon, ...
  return addDays(iso, -dow);
}

// The 7 ISO dates Sun-Sat for the week containing `iso`.
export function weekDays(iso: string): string[] {
  const start = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// "MM/DD/YYYY" (USA numeric format) from an ISO date.
export function formatUsDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ISO (yyyy-mm-dd) <-> US display (MM/DD/YYYY) for the custom US date field.
// Native <input type="date"> shows whatever the OS region dictates, so we drive
// the format ourselves to guarantee MM/DD/YYYY on every machine.
export function isoToUs(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${m}/${d}/${y}`;
}

// Parse "MM/DD/YYYY" to an ISO date, or null if it isn't a real calendar date.
export function usToIso(us: string): string | null {
  const m = us.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // Reject impossible dates like 02/30 by round-tripping through a Date.
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${yyyy}-${pad(mm)}-${pad(dd)}`;
}

// "Mon 06/16/2025", used in the UI and the email subject/body.
export function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
  });
  return `${weekday} ${formatUsDate(iso)}`;
}

// "Mon" for the compact week-view header (weekday line).
export function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

// "06/16" for the compact week-view header (date line, paired with weekdayShort).
export function monthDayShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}
