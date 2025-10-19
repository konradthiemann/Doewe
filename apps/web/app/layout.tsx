import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Doewe",
  description: "Familienmanagement: Finanzen tracken, Ziele setzen, Muster erkennen."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}