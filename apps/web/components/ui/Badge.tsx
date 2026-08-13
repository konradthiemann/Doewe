import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

/**
 * Pill-Badge/Chip für semantische Marker (Einnahme/Ausgabe/Sparen), Haushalts-
 * Provenienz ("von {Name}"), Budget-Status und Feature-Tags. Farbe folgt den
 * Finanz-/Status-Tokens; `neutral` trägt eine Border, damit sie auf Karten
 * ohne Fläche lesbar bleibt. Farbe ist nie alleiniger Bedeutungsträger — der
 * Text benennt den Zustand.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      tone: {
        income: "bg-income-soft text-income",
        expense: "bg-expense-soft text-expense",
        savings: "bg-savings-soft text-savings",
        brand: "bg-brand-soft text-brand",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        info: "bg-info-soft text-info",
        neutral: "border border-line bg-surface-2 font-medium text-ink-muted",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
