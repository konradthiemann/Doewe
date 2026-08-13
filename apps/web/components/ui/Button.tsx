"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib/cn";

import { Spinner } from "./Spinner";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-field text-sm font-semibold shadow-card transition duration-quick ease-calm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-on hover:bg-brand-hover",
        secondary:
          "border border-line-strong bg-transparent text-ink hover:bg-surface-2",
        danger:
          "bg-danger text-brand-on hover:opacity-90",
        ghost:
          "shadow-none bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2",
        lg: "px-5 py-2.5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Shows a leading spinner and disables the button while an action is in flight.
   * Marks the button `aria-busy`; the visible label (children) should switch to a
   * progress phrasing (e.g. "Saving…") to reinforce the state.
   */
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner size={size === "sm" ? "sm" : "md"} className="-ml-0.5 mr-2 shrink-0" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
