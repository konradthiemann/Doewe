"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { useI18n } from "../lib/i18n";

/**
 * Persistent navigation sidebar for tablet/desktop (>= md, 768px).
 * Hidden on phones via `hidden md:flex` — the floating bottom nav (Header.tsx)
 * and the top hamburger bar (AppChrome.tsx) take over below md.
 *
 * Mirrors the primary nav + context-aware "add" action from Header.tsx and the
 * secondary links (settings, legal) from AppChrome's drawer, reusing the same
 * i18n keys and active-state styling for visual consistency.
 */

const rowBase =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
const rowActive = "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300";
const rowIdle = "text-gray-700 hover:bg-gray-100 dark:text-neutral-200 dark:hover:bg-neutral-800";

const iconClass = "h-5 w-5 shrink-0";

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  const navLinks: Array<{ href: string; label: string; icon: JSX.Element }> = [
    {
      href: "/",
      label: t("nav.dashboard"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M6.5 10v9h11v-9" />
        </svg>
      )
    },
    {
      href: "/transactions",
      label: t("nav.transactions"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 6h14" />
          <path d="M5 12h10" />
          <path d="M5 18h8" />
        </svg>
      )
    },
    {
      href: "/saving-plan",
      label: t("nav.savingPlan"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 4h14v4H5z" />
          <path d="M5 8h14v12H5z" />
          <path d="M9 12h6" />
          <path d="M9 16h3" />
        </svg>
      )
    },
    {
      href: "/review",
      label: t("nav.review"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <path d="M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2" />
          <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          <path d="M9 12h6" />
          <path d="M9 16h3" />
        </svg>
      )
    }
  ];

  const secondaryLinks: Array<{ href: string; label: string; icon: JSX.Element }> = [
    {
      href: "/settings",
      label: t("nav.settings"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.06A1.65 1.65 0 0 0 9 4.09V4a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.06a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.06A1.65 1.65 0 0 0 19.91 11H20a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      )
    },
    {
      href: "/tax",
      label: t("nav.tax"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14.25l6-6" />
          <path d="M19.5 4.757v16.993l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" />
          <path d="M9.75 9h.008v.008H9.75V9Z" />
          <path d="M14.25 13.5h.008v.008h-.008V13.5Z" />
        </svg>
      )
    },
    {
      href: "/impressum",
      label: t("legal.impressum"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      )
    },
    {
      href: "/datenschutz",
      label: t("legal.privacy"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      )
    }
  ];

  // Context-aware primary action — mirrors Header.tsx's FAB target.
  const primaryAction = useMemo(() => {
    const normalized = pathname ?? "/";
    if (normalized.startsWith("/saving-plan")) {
      return {
        href: "/saving-plan?new=1",
        label: t("action.addPlannedSaving"),
        icon: (
          <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-4l-3 3v-3H7a4 4 0 0 1-4-4Z" />
            <path d="M8 9V5" />
            <path d="M16 9V5" />
            <path d="M9.5 13.5h5" />
          </svg>
        )
      };
    }
    return {
      href: "/transactions?new=true",
      label: t("action.addTransaction"),
      icon: (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      )
    };
  }, [pathname, t]);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-gray-100 bg-white md:flex lg:w-64 dark:border-neutral-800 dark:bg-neutral-950">
      {/* Brand */}
      <div className="flex h-14 items-center px-5">
        <span className="text-base font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
          Doewe
        </span>
      </div>

      {/* Primary action */}
      <div className="px-3 pb-2">
        <Link
          href={primaryAction.href}
          className="flex items-center gap-3 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950"
        >
          {primaryAction.icon}
          {primaryAction.label}
        </Link>
      </div>

      {/* Primary navigation */}
      <nav aria-label={t("menu.title")} className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navLinks.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`${rowBase} ${active ? rowActive : rowIdle}`}
            >
              {icon}
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Secondary links */}
      <div className="space-y-1 border-t border-gray-100 px-3 py-3 dark:border-neutral-800">
        {secondaryLinks.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`${rowBase} ${active ? rowActive : rowIdle}`}
            >
              {icon}
              {label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
