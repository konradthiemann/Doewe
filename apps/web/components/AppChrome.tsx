"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

import { isAuthRoute } from "../lib/authRoutes";
import { useI18n } from "../lib/i18n";

import BackToTopButton from "./BackToTopButton";
import { BrandLockup } from "./Brand";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppChrome() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close drawer on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  // Auth pages are shown to signed-out users — no app nav/sidebar chrome.
  if (isAuthRoute(pathname)) {
    return null;
  }

  return (
    <>
      <BackToTopButton />

      {/* Desktop / tablet sidebar (>= md) */}
      <Sidebar />

      {/* Top bar — phones only (< md); the sidebar replaces it from md up */}
      <header className="fixed top-0 left-0 right-0 z-header flex h-12 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80 md:hidden">
        <BrandLockup markClassName="h-5 w-5" className="[&>span:last-child]:text-sm" />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("menu.open")}
          aria-expanded={menuOpen}
          className="flex h-8 w-8 items-center justify-center rounded-field text-ink-muted transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Drawer overlay */}
      {menuOpen && (
        <div
          /* z-overlay: must stack above the bottom pill nav (Header.tsx, z-nav), which follows in DOM order */
          className="fixed inset-0 z-overlay flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={t("menu.title")}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Slide-in panel */}
          <div className="relative flex w-72 flex-col bg-surface shadow-raised">
            {/* Panel header */}
            <div className="flex h-12 items-center justify-between border-b border-line px-4">
              <span className="text-sm font-semibold text-ink">
                {t("menu.title")}
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t("common.close")}
                className="flex h-8 w-8 items-center justify-center rounded-field text-ink-muted transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M18 6L6 18M6 6L18 18" />
                </svg>
              </button>
            </div>

            {/* Panel nav */}
            <nav className="flex-1 space-y-1 px-3 py-4">
              <Link
                href="/settings"
                className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  pathname === "/settings"
                    ? "bg-brand-soft text-brand"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.06A1.65 1.65 0 0 0 9 4.09V4a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.06a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.06A1.65 1.65 0 0 0 19.91 11H20a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
                {t("nav.settings")}
              </Link>

              <Link
                href="/categories"
                className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  pathname === "/categories"
                    ? "bg-brand-soft text-brand"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59c0 .53.21 1.04.59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83Z" />
                  <path d="M7.5 7.5h.01" />
                </svg>
                {t("nav.categories")}
              </Link>

              <Link
                href="/tax"
                className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  pathname === "/tax"
                    ? "bg-brand-soft text-brand"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 14.25l6-6" />
                  <path d="M19.5 4.757v16.993l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" />
                  <path d="M9.75 9h.008v.008H9.75V9Z" />
                  <path d="M14.25 13.5h.008v.008h-.008V13.5Z" />
                </svg>
                {t("nav.tax")}
              </Link>

              <div className="my-2 h-px bg-line" aria-hidden="true" />

              <Link
                href="/impressum"
                className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  pathname === "/impressum"
                    ? "bg-brand-soft text-brand"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
                {t("legal.impressum")}
              </Link>

              <Link
                href="/datenschutz"
                className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  pathname === "/datenschutz"
                    ? "bg-brand-soft text-brand"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                {t("legal.privacy")}
              </Link>
            </nav>

            {/* Sign out */}
            <div className="border-t border-line px-3 py-3">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium text-danger transition hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                {t("auth.signOut")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Header />
    </>
  );
}
