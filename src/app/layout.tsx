import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bus Ticketing",
  description: "Book a seat, pay, and board with a QR ticket.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
