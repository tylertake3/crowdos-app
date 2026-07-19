import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laural",
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
        {/* Laural design system — Poppins everywhere (matches the parent
            product's geometric sans). IBM Plex Mono kept for tabular money
            columns where digit alignment matters. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Cinzel:wght@500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
