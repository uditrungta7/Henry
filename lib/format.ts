// Small display-only formatting helpers. They never change stored values.

// "06:00:00" / "06:00" -> "06:00"
export function formatTime(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 5);
}

// "SUPERINTENDENT" / "tradesman" -> "Superintendent" / "Tradesman"
export function titleCase(value: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// "2026-06-16" -> "Jun 16"
export function formatShortDate(iso: string): string {
  // Parse as local date parts to avoid timezone shifting the day.
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Summarize one or more time-off ranges for a table cell, e.g. "Jun 16–18"
// or "Jun 16–18 +1 more". Headlines the soonest range that hasn't ended yet
// (falling back to the latest past range if all are over). `today` is an ISO
// date string (YYYY-MM-DD); ISO dates compare correctly as strings.
export function summarizeTimeOff(
  ranges: { start_date: string; end_date: string }[],
  today: string
): string {
  if (ranges.length === 0) return "";

  // Soonest not-yet-ended range; if none, the most recent past one.
  const upcoming = ranges
    .filter((r) => r.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const headline =
    upcoming[0] ??
    [...ranges].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];

  const { start_date, end_date } = headline;
  let label: string;
  if (start_date === end_date) {
    label = formatShortDate(start_date);
  } else {
    const sameMonth = start_date.slice(0, 7) === end_date.slice(0, 7);
    // Within one month show "Jun 16–18"; across months "Jun 30–Jul 2".
    const endLabel = sameMonth
      ? formatShortDate(end_date).replace(/^\w+\s/, "")
      : formatShortDate(end_date);
    label = `${formatShortDate(start_date)}–${endLabel}`;
  }
  return ranges.length > 1 ? `${label} +${ranges.length - 1} more` : label;
}
