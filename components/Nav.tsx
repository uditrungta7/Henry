"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/schedule", label: "Schedule" },
  { href: "/customers", label: "Customers" },
  { href: "/employees", label: "Employees" },
  { href: "/import", label: "Import" },
  { href: "/history", label: "Publish history" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links.map((link) => {
        // The packaged app serves the dashboard as /index.html (static export),
        // so "/" must match both forms or Dashboard never highlights.
        const active =
          link.href === "/"
            ? pathname === "/" || pathname === "/index.html"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-2 font-medium ${
              active
                ? "bg-blue-600 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
