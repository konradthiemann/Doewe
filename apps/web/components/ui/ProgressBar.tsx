import { cn } from "../../lib/cn";

/**
 * Ruhige Fortschritts-Primitive für Budget-Ampel und den Hero-Segmentbalken.
 * Track = surface-2; Farbe folgt den Tokens. Rot (danger) nur bei „über" —
 * Calm Finance: keine grelle Skala. A11y: role="progressbar" + aria-Werte;
 * Farbe ist nie alleiniger Bedeutungsträger (Beschriftung liegt daneben).
 */

/** Ampel-Ton aus dem Auslastungs-Verhältnis (worst-first, danger nur bei ≥100 %). */
export function budgetTone(ratio: number): "brand" | "warning" | "danger" {
  if (ratio >= 1) return "danger";
  if (ratio >= 0.85) return "warning";
  return "brand";
}

const fillTone: Record<"brand" | "warning" | "danger" | "savings" | "income", string> = {
  brand: "bg-brand",
  warning: "bg-warning",
  danger: "bg-danger",
  savings: "bg-savings",
  income: "bg-income",
};

export interface ProgressBarProps {
  /** 0..1 (Werte >1 werden auf 100 % gekappt). */
  value: number;
  tone?: keyof typeof fillTone;
  className?: string;
  label?: string;
}

export function ProgressBar({ value, tone = "brand", className, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-base ease-calm motion-reduce:transition-none", fillTone[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export interface SegmentBarSegment {
  /** Anteil 0..1; Segmente werden anteilig gerendert. */
  value: number;
  tone: keyof typeof fillTone | "neutral";
  label: string;
}

const segTone: Record<string, string> = { ...fillTone, neutral: "bg-ink-faint" };

/** Hero-Segmentbalken: ausgegeben / gespart / frei nebeneinander. */
export function SegmentBar({ segments, className }: { segments: SegmentBarSegment[]; className?: string }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      {segments.map((s, i) => (
        <div
          key={i}
          className={cn("h-full first:rounded-l-full last:rounded-r-full", segTone[s.tone])}
          style={{ width: `${(Math.max(0, s.value) / total) * 100}%` }}
          title={s.label}
        />
      ))}
    </div>
  );
}
