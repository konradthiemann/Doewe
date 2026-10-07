"use client";

import { useState, type ReactNode } from "react";

type CollapsibleSectionProps = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  headerAside?: ReactNode;
  children: ReactNode;
};

export function CollapsibleSection({
  id,
  title,
  defaultOpen = false,
  headerAside,
  children
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const headingId = `${id}-heading`;
  const panelId = `${id}-panel`;

  return (
    <section aria-labelledby={headingId}>
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id={headingId} className="min-w-0 text-lg font-medium">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-field text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              {title}
            </button>
          </h2>
          {headerAside}
        </div>
        {open && (
          <div id={panelId} className="mt-4">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
