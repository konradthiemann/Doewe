"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { useI18n } from "../lib/i18n";

export default function Header() {
  const pathname = usePathname();
  const { t } = useI18n();

  const navLinks: Array<{ href: string; label: string; icon: (active: boolean) => JSX.Element }> = [
    {
      href: "/",
      label: t("nav.dashboard"),
      icon: (active) => (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-6 w-6 transition ${active ? "text-brand" : "text-ink-faint"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M6.5 10v9h11v-9" />
        </svg>
      )
    },
    {
      href: "/transactions",
      label: t("nav.transactions"),
      icon: (active) => (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-6 w-6 transition ${active ? "text-brand" : "text-ink-faint"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 6h14" />
          <path d="M5 12h10" />
          <path d="M5 18h8" />
        </svg>
      )
    },
    {
      href: "/saving-plan",
      label: t("nav.savingPlan"),
      icon: (active) => (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-6 w-6 transition ${active ? "text-brand" : "text-ink-faint"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
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
      icon: (active) => (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-6 w-6 transition ${active ? "text-brand" : "text-ink-faint"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <path d="M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2" />
          <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          <path d="M9 12h6" />
          <path d="M9 16h3" />
        </svg>
      )
    }
  ];

  const primaryAction = useMemo(() => {
    const normalized = pathname ?? "/";
    if (normalized.startsWith("/saving-plan")) {
      return {
        href: "/saving-plan?new=1",
        label: t("action.addPlannedSaving"),
        icon: (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      )
    };
  }, [pathname, t]);

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-nav px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden"
    >
      <div className="mx-auto max-w-xl">
        <div className="relative flex items-end justify-center">
          <div className="flex w-full items-center justify-between gap-2 rounded-full border border-line bg-surface/95 px-4 pb-3 pt-4 shadow-raised backdrop-blur supports-[backdrop-filter]:bg-surface/85">
            {navLinks.map(({ href, label, icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-1 rounded-field px-2 py-1 text-xs font-medium transition-all focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-2"}`}
                >
                  {icon(active)}
                  <span className="text-[11px]">{label}</span>
                </Link>
              );
            })}
          </div>
          <Link
            href={primaryAction.href}
            className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-bg bg-brand text-brand-on shadow-fab transition hover:bg-brand-hover hover:scale-105 focus:outline-none focus-visible:ring focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-95"
            aria-label={primaryAction.label}
          >
            {primaryAction.icon}
          </Link>
        </div>
      </div>
    </nav>
  );
}
