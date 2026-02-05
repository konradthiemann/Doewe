"use client";

import { SessionProvider } from "next-auth/react";

import { I18nProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/ThemeContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <I18nProvider>{children}</I18nProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
