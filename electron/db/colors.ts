// Color picker for the main-process import upsert. Mirrors lib/colors.ts (the
// renderer's copy) so imported rows get the same distinct colors as UI-created
// ones. Kept here so the main process has no dependency on the Next renderer tree.

const PALETTE = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2",
  "#ca8a04", "#db2777", "#4f46e5", "#65a30d", "#0d9488", "#b91c1c",
  "#7c3aed", "#c2410c", "#0369a1", "#a16207",
];

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function colorForIndex(i: number): string {
  if (i < PALETTE.length) return PALETTE[i];
  const n = i - PALETTE.length;
  const hue = (n * 137.508) % 360;
  const sat = 60 + (n % 3) * 8;
  const light = 42 + (n % 2) * 8;
  return hslToHex(hue, sat, light);
}

export function nextUnusedColor(used: (string | null | undefined)[]): string {
  const taken = new Set(used.filter(Boolean).map((c) => c!.toLowerCase()));
  for (let j = 0; j < taken.size + PALETTE.length + 1; j++) {
    const c = colorForIndex(j);
    if (!taken.has(c.toLowerCase())) return c;
  }
  return colorForIndex(taken.size);
}
