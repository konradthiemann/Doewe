import { env } from "../env";

/**
 * Prüft den `Authorization: Bearer <CRON_SECRET>`-Header der Cron-Endpoints.
 * Ohne gesetztes CRON_SECRET ODER bei falschem Token → nicht autorisiert.
 * So bleibt der Endpoint auch versehentlich nie offen.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
