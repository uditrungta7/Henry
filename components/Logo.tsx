// Henry logo, "people on rows": three people, each with their own week row —
// what the app manages. Bare (no tile) so it stays light on white surfaces;
// the installer / dock icon uses the same mark on a white tile (build/icon.*).
// Colors by role: orange = the field crew's energy (safety-vest orange, blue's
// complement), blue = trust/reliability (the app's accent), teal = confirmed /
// done. Rows are neutral slate — the schedule is the structure, people are the
// color. Same value step for all three hues so the crew reads as equals.
export function LogoMark({
  size = 32,
  className = "",
  onDark = false,
}: {
  size?: number;
  className?: string;
  // Rows flip to light slate when the mark sits on a dark surface.
  onDark?: boolean;
}) {
  const row = onDark ? "#cbd5e1" : "#475569";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Henry"
      className={className}
    >
      <circle cx="7" cy="9" r="6" fill="#f97316" />
      <rect x="18" y="4.5" width="28" height="9" rx="4.5" fill={row} />
      <circle cx="7" cy="24" r="6" fill="#3b82f6" />
      <rect x="18" y="19.5" width="19" height="9" rx="4.5" fill={row} />
      <circle cx="7" cy="39" r="6" fill="#14b8a6" />
      <rect x="18" y="34.5" width="24" height="9" rx="4.5" fill={row} />
    </svg>
  );
}

// Mark + wordmark, for the login screen and headers.
export function LogoWordmark({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-xl font-bold tracking-tight text-slate-900">
        Henry
      </span>
    </span>
  );
}
