"use client";

import { useEffect, useState } from "react";

import { useI18n } from "../lib/i18n";

export default function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > window.innerHeight;
      setVisible((prev) => (prev !== shouldShow ? shouldShow : prev));
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label={t("common.scrollTop")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed right-5 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-indigo-200 bg-white/95 text-indigo-600 shadow-lg transition focus:outline-none focus-visible:ring focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-indigo-500/50 dark:bg-neutral-900/95 dark:text-indigo-300 dark:focus-visible:ring-offset-neutral-900 ${visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5" />
        <path d="m6 11 6-6 6 6" />
      </svg>
    </button>
  );
}
