import { cn } from "../../lib/cn";

/**
 * Reusable loading spinner. Purely presentational by default (aria-hidden) — the
 * accessible loading state is conveyed by the surrounding control (e.g. a Button's
 * `aria-busy`). Pass `label` to render a standalone spinner with a screen-reader
 * announcement (e.g. page- or section-level loading).
 *
 * Colour follows `currentColor`, so it inherits the text colour of its context.
 */

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
} as const;

export interface SpinnerProps {
  size?: keyof typeof sizeClasses;
  className?: string;
  /** When set, renders an sr-only live label next to the spinner. */
  label?: string;
}

export function Spinner({ size = "md", className, label }: SpinnerProps) {
  const svg = (
    <svg
      className={cn("animate-spin", sizeClasses[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );

  if (!label) return svg;

  return (
    <span role="status" className="inline-flex items-center gap-2">
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  );
}
