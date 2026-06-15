// A palette of visually distinct colors and a helper to pick the next one not
// already in use, so new customers / employees get unique color coding.
// Order chosen for good separation between adjacent picks.
export const PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#dc2626", // red
  "#9333ea", // purple
  "#ea580c", // orange
  "#0891b2", // cyan
  "#ca8a04", // amber
  "#db2777", // pink
  "#4f46e5", // indigo
  "#65a30d", // lime
  "#0d9488", // teal
  "#b91c1c", // dark red
  "#7c3aed", // violet
  "#c2410c", // burnt orange
  "#0369a1", // sky
  "#a16207", // gold
];

// First palette color not already used (case-insensitive). When every palette
// color is taken, fall back to the next one round-robin by count so it still
// differs from its immediate neighbours as much as possible.
export function nextUnusedColor(used: (string | null | undefined)[]): string {
  const taken = new Set(
    used.filter(Boolean).map((c) => c!.toLowerCase())
  );
  const free = PALETTE.find((c) => !taken.has(c.toLowerCase()));
  if (free) return free;
  // Palette exhausted: cycle by how many records exist.
  return PALETTE[taken.size % PALETTE.length];
}
