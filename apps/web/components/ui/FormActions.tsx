import { type ReactNode } from "react";

import { cn } from "../../lib/cn";

export interface FormActionsProps {
  children: ReactNode;
  className?: string;
}

/**
 * Sticky action footer for the scrollable modal forms (`p-4 sm:p-6` containers).
 * Keeps the submit/cancel buttons stacked and always in reach, so short entries
 * can be saved without scrolling past optional fields. Bleeds to the container
 * edges via negative margins so scrolled content never peeks out around it —
 * hence it must be the last child of the form.
 */
export function FormActions({ children, className }: FormActionsProps) {
  return (
    <div
      data-testid="form-actions"
      className={cn(
        "sticky -bottom-4 z-10 -mx-4 -mb-4 flex flex-col gap-2 border-t border-line bg-surface px-4 pb-4 pt-3 sm:-mx-6 sm:-bottom-6 sm:-mb-6 sm:px-6 sm:pb-6",
        className
      )}
    >
      {children}
    </div>
  );
}
