import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrowdOS",
  description: "Crowd budgeting and scheduling for UK film & TV",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
