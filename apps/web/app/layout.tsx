import "./globals.css";

import AppChrome from "../components/AppChrome";

import Providers from "./providers";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Doewe",
  description: "Family management: track finances, set goals, detect patterns."
};

// Inline script to prevent flash of wrong theme
const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('doewe-theme') || 'system';
    var resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.add(resolved);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased flex flex-col">
        <a href="#maincontent" className="sr-only">
          Skip to main
        </a>
        <Providers>
          <div className="flex-1 w-full pb-[calc(7rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
          <AppChrome />
        </Providers>
      </body>
    </html>
  );
}