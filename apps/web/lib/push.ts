import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

import { env } from "../env";

import { prisma } from "./prisma";

/**
 * Web-Push-Versand (Teil C) — analog zum Stufen-Muster in lib/mailer.ts:
 *  1. Ist ein VAPID-Keypaar konfiguriert, wird echt über den Push-Dienst des
 *     Browsers (Apple/Google/Mozilla) versendet.
 *  2. Ohne Konfiguration wird die Nachricht nur geloggt — so bleiben die Flows
 *     lokal und in Tests ohne Keys funktionsfähig.
 *
 * Payloads bewusst minimal (keine konkreten Beträge): sie laufen zwar
 * verschlüsselt, aber über fremde Push-Dienste.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Ziel-Pfad beim Klick (z. B. "/dashboard", "/review"). */
  url?: string;
  /** Notification-Tag zum Zusammenfassen/Ersetzen gleichartiger Pushes. */
  tag?: string;
};

function pushConfigured(): boolean {
  return !!(env.VAPID_PRIVATE_KEY && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

let vapidReady = false;
function ensureVapidDetails(): void {
  if (vapidReady || !pushConfigured()) return;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || "mailto:noreply@doewe.app",
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    env.VAPID_PRIVATE_KEY as string
  );
  vapidReady = true;
}

/**
 * Longest wait for one push service, in milliseconds. Budget alerts are awaited
 * by the booking routes, so a hanging endpoint would otherwise hold the
 * response open after the booking is committed.
 */
export const PUSH_SEND_TIMEOUT_MS = 5_000;

class PushTimeoutError extends Error {
  constructor() {
    super(`Push send timed out after ${PUSH_SEND_TIMEOUT_MS} ms`);
  }
}

/**
 * One send with a hard deadline. web-push's own `timeout` only covers an idle
 * socket and destroys it; the race also ends a response that trickles in.
 * A timeout rejects without a status code, so the caller treats it like any
 * other failure and keeps the subscription.
 */
async function sendWithTimeout(subscription: WebPushSubscription, body: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PushTimeoutError()), PUSH_SEND_TIMEOUT_MS);
  });
  try {
    await Promise.race([webpush.sendNotification(subscription, body, { timeout: PUSH_SEND_TIMEOUT_MS }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sendet eine Push-Nachricht an ALLE registrierten Geräte eines Nutzers und
 * gibt die Anzahl erfolgreicher Zustellungen zurück. Abgelaufene Subscriptions
 * (HTTP 404/410) werden dabei aufgeräumt. Jeder Versand wartet höchstens
 * PUSH_SEND_TIMEOUT_MS; eine Zeitüberschreitung zählt als Fehlschlag, das Abo
 * bleibt bestehen.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  if (!pushConfigured()) {
    // eslint-disable-next-line no-console -- intentional dev-only fallback output
    console.info(`[push] No VAPID keys configured — push not sent.\n  user: ${userId}\n  ${payload.title}: ${payload.body}`);
    return 0;
  }

  ensureVapidDetails();
  const body = JSON.stringify(payload);

  const results = await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendWithTimeout({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
        return true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Endpoint ist tot (Abmeldung/Neuinstallation) → Row entfernen.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        }
        return false;
      }
    })
  );

  return results.filter(Boolean).length;
}
