import { getServerSession } from "next-auth/next";

import { env } from "../env";

import { authOptions } from "./authOptions";
import { prisma } from "./prisma";

/** Die Nutzerdaten, die aus der Session gelesen werden. */
export type SessionUser = {
  id: string;
  email: string | null;
  // Teil D: der Haushalt ist die Mandanten-Grenze. Alle API-Routen scopen ihre
  // Queries über `householdId`, nicht mehr über `id` (userId).
  householdId: string;
  role: string;
};

/**
 * Liest den eingeloggten Nutzer aus der NextAuth-Session.
 * Gibt `null` zurück wenn niemand eingeloggt ist.
 *
 * In Tests: Wenn `TEST_USER_ID_BYPASS` gesetzt ist, wird kein echter Session-Check
 * gemacht — dadurch können API-Route-Tests ohne echtes Login laufen.
 * Diese Umgebungsvariable darf NIEMALS in Produktion gesetzt sein.
 *
 * Verwendung in API-Routen:
 * ```ts
 * const user = await getSessionUser();
 * if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 * ```
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  let id: string;
  let email: string | null;

  if (env.TEST_USER_ID_BYPASS) {
    id = env.TEST_USER_ID_BYPASS;
    email = env.TEST_USER_EMAIL_BYPASS ?? null;
  } else {
    const session = await getServerSession(authOptions);
    const sessionId = session?.user?.id;
    if (!sessionId) return null;
    id = sessionId;
    email = session.user?.email ?? null;
  }

  // Resolve the household membership on every request so that accepting an
  // invite or leaving a household takes effect immediately (same reasoning as
  // the passwordChangedAt session eviction). A user without a membership is
  // treated as unauthenticated — provisioning always creates one.
  const membership = await prisma.householdMember.findUnique({
    where: { userId: id },
    select: { householdId: true, role: true }
  });
  if (!membership) return null;

  return { id, email, householdId: membership.householdId, role: membership.role };
}

/**
 * Wie `getSessionUser()`, aber wirft einen Fehler statt `null` zurückzugeben.
 * Nützlich wenn man den `null`-Fall nicht separat behandeln möchte und
 * ein höheres Error-Boundary den Fehler abfängt.
 *
 * @throws Error("UNAUTHENTICATED") wenn keine Session vorhanden
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}
