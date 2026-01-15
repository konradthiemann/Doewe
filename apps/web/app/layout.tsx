import "./globals.css";

import BackToTopButton from "../components/BackToTopButton";
import Header from "../components/Header";
import Providers from "./providers";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Doewe",
  description: "Family management: track finances, set goals, detect patterns."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased flex flex-col">
        <a href="#maincontent" className="sr-only">
          Skip to main
        </a>
        <Providers>
          <div className="flex-1 w-full pb-[calc(7rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
          <BackToTopButton />
          <Header />
        </Providers>
      </body>
    </html>
  );
}