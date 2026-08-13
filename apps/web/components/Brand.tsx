import { cn } from "../lib/cn";

/**
 * Doewe brand mark — the "d" as an open coin/ring with an upright stem.
 * Stroke uses `currentColor` so it adapts to the theme: set `text-brand`
 * (or any token colour) on the element to tint it. Matches the design-system
 * logo in docs/design/logo/.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="21"
        cy="28"
        r="13"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="66 16"
        transform="rotate(-55 21 28)"
      />
      <line
        x1="34"
        y1="7"
        x2="34"
        y2="41"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Brand lockup: the mark (brand-tinted) beside the "doewe" wordmark (ink).
 * Used in the sidebar, the mobile top bar, and the login screen.
 */
export function BrandLockup({
  className,
  markClassName = "h-6 w-6"
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark className={cn("shrink-0 text-brand", markClassName)} />
      <span className="text-base font-semibold tracking-tight text-ink">
        Doewe
      </span>
    </span>
  );
}
