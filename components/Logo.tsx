// Henry logo: a rounded blue tile with a white spark/bolt that doubles as a
// checkmark — nods to the electrical trade (bolt) and to scheduling (check =
// "set / done"), with an amber accent for the trade's energy color. Designed to
// stay legible from 20px (sidebar/favicon) up. Pure SVG, themeable, no assets.
export function LogoMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
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
      <defs>
        <linearGradient id="henryTile" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      {/* Rounded tile */}
      <rect width="48" height="48" rx="12" fill="url(#henryTile)" />
      {/* Lightning bolt — the electrical trade mark, white body. */}
      <path
        d="M27 8 L15 26 H23 L21 40 L35 20 H26 L30 8 Z"
        fill="#ffffff"
      />
      {/* Amber spark tip — the trade's energy color, top-right. */}
      <circle cx="34" cy="14" r="2.6" fill="#f59e0b" />
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
