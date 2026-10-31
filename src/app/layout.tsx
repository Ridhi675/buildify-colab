import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buildify CoLab",
  description: "Two humans. Two AI agents. One shared product. Every decision understood.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen text-[14px]">{children}</body>
    </html>
  );
}
