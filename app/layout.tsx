import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StuntOS — Stunt Schedule Breakdown",
  description: "Crowd & stunt budgeting and scheduling for UK film and TV",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Same font loading as the prototype — Barlow Condensed for headings
            and numbers, IBM Plex Mono for data, Inter for body text. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
