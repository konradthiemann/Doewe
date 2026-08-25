import { env } from "../env";

/**
 * Prüft den `Authorization: Bearer <DOEWE_SERVICE_TOKEN>`-Header der
 * Admin-Endpoints (z. B. /api/admin/*), die von externen, vertrauenswürdigen
 * Diensten (dem Symfony-Control-Plane-Backend) gelesen werden — nicht per
 * Session, sondern per Secret-Header, analog zu `cronAuth.ts`, aber
 * bewusst ein eigenständiger Token (getrennte Rotationsfähigkeit, andere
 * Semantik: Lesezugriff statt Cron-Trigger).
 * Ohne gesetztes DOEWE_SERVICE_TOKEN ODER bei falschem Token → nicht autorisiert.
 */
export function isAuthorizedService(req: Request): boolean {
  const secret = env.DOEWE_SERVICE_TOKEN;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
