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

// Convert HSL to a #RRGGBB hex string.
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Generate a distinct color by index: the curated PALETTE first (nicest), then
// evenly-spaced HSL hues beyond it so any count gets visually separable colors.
// The golden-angle hue step keeps consecutive generated colors far apart.
export function colorForIndex(i: number): string {
  if (i < PALETTE.length) return PALETTE[i];
  const n = i - PALETTE.length;
  const hue = (n * 137.508) % 360; // golden angle for good spread
  // Alternate lightness/saturation a little so wrapped hues still differ.
  const sat = 60 + (n % 3) * 8;
  const light = 42 + (n % 2) * 8;
  return hslToHex(hue, sat, light);
}

// First color not already used (case-insensitive). Walks generated colors so
// even past the curated palette every new record gets a fresh, distinct color.
export function nextUnusedColor(used: (string | null | undefined)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => c!.toLowerCase()));
  for (let i = 0; i < taken.size + PALETTE.length + 1; i++) {
    const c = colorForIndex(i);
    if (!taken.has(c.toLowerCase())) return c;
  }
  return colorForIndex(taken.size); // fallback (effectively unreachable)
}
