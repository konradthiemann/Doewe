"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const NAV_LINKS: Array<{
  href: string;
  label: string;
  icon: (active: boolean) => JSX.Element;
}> = [
  {
    href: "/",
    label: "Dashboard",
    icon: (active) => (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`h-6 w-6 transition ${active ? "text-indigo-600" : "text-gray-500 dark:text-neutral-400"}`}
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
    label: "Transactions",
    icon: (active) => (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`h-6 w-6 transition ${active ? "text-indigo-600" : "text-gray-500 dark:text-neutral-400"}`}
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
    label: "Saving plan",
    icon: (active) => (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`h-6 w-6 transition ${active ? "text-indigo-600" : "text-gray-500 dark:text-neutral-400"}`}
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
    href: "/settings",
    label: "Settings",
    icon: (active) => (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`h-6 w-6 transition ${active ? "text-indigo-600" : "text-gray-500 dark:text-neutral-400"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.06A1.65 1.65 0 0 0 9 4.09V4a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.06a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.06A1.65 1.65 0 0 0 19.91 11H20a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    )
  }
];

export default function Header() {
  const pathname = usePathname();

  const primaryAction = useMemo(() => {
    const normalized = pathname ?? "/";
    if (normalized.startsWith("/saving-plan")) {
      return {
        href: "/saving-plan?new=1",
        label: "Add planned saving",
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
      href: "/transactions?new=1",
      label: "Add transaction",
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
  }, [pathname]);

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
    >
      <div className="mx-auto max-w-xl">
        <div className="relative flex items-end justify-center">
          <div className="flex w-full items-center justify-between gap-4 rounded-full border border-gray-200 bg-white/95 px-6 pb-3 pt-5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-neutral-700 dark:bg-neutral-900/95 dark:supports-[backdrop-filter]:bg-neutral-900/80">
            {NAV_LINKS.map(({ href, label, icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-1 text-xs font-medium transition focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900 ${active ? "text-indigo-600" : "text-gray-600 dark:text-neutral-300"}`}
                >
                  {icon(active)}
                  <span className="text-[11px]">{label}</span>
                </Link>
              );
            })}
          </div>
          <Link
            href={primaryAction.href}
            className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-white bg-indigo-600 text-white shadow-xl transition hover:bg-indigo-500 focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-900"
            aria-label={primaryAction.label}
          >
            {primaryAction.icon}
          </Link>
        </div>
      </div>
    </nav>
  );
}
