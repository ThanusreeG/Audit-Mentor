import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Audit Assistant MVP",
  description: "A beginner-friendly smart contract auditing trainer."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
