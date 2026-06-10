"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring focus-visible:ring-offset-2 disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900",
        secondary:
          "border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400 focus-visible:ring-offset-white dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900",
        danger:
          "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900",
        ghost:
          "shadow-none bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400 dark:text-neutral-300 dark:hover:bg-neutral-800",
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
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
