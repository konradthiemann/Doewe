import { z } from "zod";

/** Browser-PushSubscription (aus `pushManager.subscribe(...).toJSON()`). */
export const PushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  }),
  userAgent: z.string().max(512).optional()
});

/** Abmeldung: nur der Endpoint identifiziert die zu löschende Subscription. */
export const PushUnsubscribeInput = z.object({
  endpoint: z.string().url()
});
