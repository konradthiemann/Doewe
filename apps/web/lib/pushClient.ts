"use client";

/**
 * Client-Helfer für Web Push (Teil C): Permission-Geste, Subscription beim
 * Service Worker anlegen und beim Server registrieren/abmelden. Der öffentliche
 * VAPID-Key kommt aus NEXT_PUBLIC_VAPID_PUBLIC_KEY (zur Build-Zeit inlined).
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** VAPID-Key (URL-safe Base64) → Uint8Array für pushManager.subscribe. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Unterstützt der Browser überhaupt Web Push? */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Ist ein öffentlicher VAPID-Key konfiguriert? */
export function vapidConfigured(): boolean {
  return !!VAPID_PUBLIC_KEY;
}

export type SubscribeResult = "subscribed" | "denied" | "unsupported" | "unconfigured";

/** Permission anfordern, Subscription anlegen und beim Server registrieren. */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!pushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    }));

  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent
    })
  });
  if (!res.ok) throw new Error(`Subscription failed (${res.status})`);
  return "subscribed";
}

/** Subscription beim Server abmelden und lokal aufheben. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await fetch("/api/push/subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

/** Ist auf diesem Gerät bereits eine Push-Subscription aktiv? */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}
