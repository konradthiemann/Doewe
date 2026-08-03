"use client";

import { SessionProvider } from "next-auth/react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { ToastProvider } from "../components/ui/Toast";
import { I18nProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/ThemeContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <SessionProvider>
        <ThemeProvider>
          <I18nProvider>
            <ToastProvider>{children}</ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </SessionProvider>
    </NuqsAdapter>
  );
}
