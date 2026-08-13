import { cn } from "../../lib/cn";

/**
 * Lade-Platzhalter (Puls-Animation) für Karten und Listen.
 * Ersetzt "Lädt…"-Texte: hält das Layout stabil und wirkt schneller.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-gray-200 dark:bg-neutral-800", className)} />;
}
