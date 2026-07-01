import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Find Your Car",
  description: "Answer a few questions, get your top 5 car matches.",
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
