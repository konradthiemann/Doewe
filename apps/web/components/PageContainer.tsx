import { type ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * Centers page content and caps its width on tablet/desktop while staying
 * full-bleed on phones. Pairs with the sidebar offset applied in layout.tsx.
 *
 * The default cap (`max-w-screen-xl`) suits multi-column pages; pass a narrower
 * width via `className` (e.g. `max-w-3xl`) for reading-heavy pages — tailwind-merge
 * keeps the override. Vertical rhythm (`space-y-*`, `grid`, …) is the caller's job.
 */
export default function PageContainer({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 xl:px-10", className)}>
      {children}
    </div>
  );
}
