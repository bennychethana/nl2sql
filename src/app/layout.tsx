import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WA Spending Explorer",
  description: "Explore Washington State vendor payments with plain-English questions",
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
