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

// "2026-06-16" -> "Jun 16", or "Jun 16, 2025" when withYear is set.
export function formatShortDate(iso: string, withYear = false): string {
  // Parse as local date parts to avoid timezone shifting the day.
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

// A range whose end is before today is past. `today` is an ISO date string.
export function isPastRange(
  range: { end_date: string },
  today: string
): boolean {
  return range.end_date < today;
}

// Render a single range, e.g. "Jun 16–18" / "Jun 30–Jul 2", with the year
// shown only when it differs from the current year (disambiguates old entries).
export function formatRange(
  start_date: string,
  end_date: string,
  today: string
): string {
  const currentYear = today.slice(0, 4);
  const startYear = start_date.slice(0, 4);
  const endYear = end_date.slice(0, 4);
  const endWithYear = endYear !== currentYear;

  if (start_date === end_date) {
    return formatShortDate(start_date, endWithYear);
  }

  // Same month and year: "Jun 3–5" or "Jun 3–5, 2025" (year once, at the end).
  if (start_date.slice(0, 7) === end_date.slice(0, 7)) {
    const startLabel = formatShortDate(start_date); // no year on start
    const endLabel = formatShortDate(end_date, endWithYear).replace(
      /^\w+\s/,
      ""
    );
    return `${startLabel}–${endLabel}`;
  }

  // Spans months: show year on each side only when it isn't the current year.
  const startLabel = formatShortDate(start_date, startYear !== currentYear);
  const endLabel = formatShortDate(end_date, endWithYear);
  return `${startLabel}–${endLabel}`;
}

// Summarize time-off for a table cell, e.g. "Jun 16–18" or "Jun 16–18 +1 more".
// Headlines the soonest not-yet-ended range and the "+N" counts only OTHER
// upcoming ranges — past leave never inflates the count. Falls back to the most
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
