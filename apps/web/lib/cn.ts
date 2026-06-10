import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines clsx and tailwind-merge for conflict-free conditional Tailwind class merging.
 * Use this instead of template literals for all className construction.
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-indigo-600", "px-2") // → "py-2 bg-indigo-600 px-2"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
