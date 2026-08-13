import { z } from "zod";

/** Teil-Update der Benachrichtigungs-Einstellungen (alle Felder optional). */
export const NotificationSettingsInput = z.object({
  notifyBudgetAlerts: z.boolean().optional(),
  notifyMonthlyReview: z.boolean().optional(),
  reminder: z
    .object({
      enabled: z.boolean().optional(),
      // "HH:MM" 24h
      time: z
        .string()
        .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      // 7-Bit-Bitmaske (Bit 0 = Sonntag … Bit 6 = Samstag)
      weekdays: z.number().int().min(0).max(127).optional(),
      timezone: z.string().min(1).max(64).optional(),
      smartSuppress: z.boolean().optional()
    })
    .optional()
});
