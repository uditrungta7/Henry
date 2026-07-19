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

// "2026-06-16" -> "06/16/2026" (USA numeric format).
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// A range whose end is before today is past. `today` is an ISO date string.
export function isPastRange(
  range: { end_date: string },
  today: string
): boolean {
  return range.end_date < today;
}

// Render a range as "MM/DD/YYYY" (single day) or "MM/DD/YYYY to MM/DD/YYYY".
export function formatRange(
  start_date: string,
  end_date: string,
  _today: string
): string {
  if (start_date === end_date) return formatShortDate(start_date);
  return `${formatShortDate(start_date)} to ${formatShortDate(end_date)}`;
}

// Summarize time-off for a table cell, e.g. "Jun 16-18" or "Jun 16-18 +1 more".
// Headlines the soonest not-yet-ended range and the "+N" counts only OTHER
// upcoming ranges, past leave never inflates the count. Falls back to the most
// recent past range only when every range is over. `today` is an ISO date.
export function summarizeTimeOff(
  ranges: { start_date: string; end_date: string }[],
  today: string
): string {
  if (ranges.length === 0) return "";

  const upcoming = ranges
    .filter((r) => !isPastRange(r, today))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  if (upcoming.length > 0) {
    const headline = upcoming[0];
    const label = formatRange(headline.start_date, headline.end_date, today);
    const others = upcoming.length - 1;
    return others > 0 ? `${label} +${others} more` : label;
  }

  // All past: show the most recent one (with year via formatRange), no "+N".
  const latest = [...ranges].sort((a, b) =>
    b.start_date.localeCompare(a.start_date)
  )[0];
  return formatRange(latest.start_date, latest.end_date, today);
}
