import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Henry",
  description: "Schedule your team and send their work for the day.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
