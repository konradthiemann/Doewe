import { de } from "./de";
import { en } from "./en";

export type Locale = "de" | "en";

export const MESSAGES: Record<Locale, Record<string, string>> = { de, en };

/** Fills `{placeholder}` tokens in a message template. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => `${vars[key] ?? ""}`);
}

/**
 * Pure translation lookup, no React dependency. Used by the client-side
 * `useI18n()` context (see `lib/i18n.tsx`) and by server-side renderers that
 * need translated strings without a React tree — e.g. the tax PDF export,
 * which renders its cover page/table copy for whichever locale the caller
 * requested.
 */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const message = MESSAGES[locale][key] ?? MESSAGES.de[key] ?? key;
  return interpolate(message, vars);
}
