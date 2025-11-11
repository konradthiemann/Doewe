import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Doewe",
  description: "Family management: track finances, set goals, detect patterns."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <a href="#maincontent" className="sr-only">
          Skip to main
        </a>
        {children}
      </body>
    </html>
  );
}