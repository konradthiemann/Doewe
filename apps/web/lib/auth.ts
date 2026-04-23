import { getServerSession } from "next-auth/next";

import { authOptions } from "./authOptions";

/** Die Nutzerdaten, die aus der Session gelesen werden. */
export type SessionUser = {
  id: string;
  email: string | null;
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
  if (process.env.TEST_USER_ID_BYPASS) {
    return {
      id: process.env.TEST_USER_ID_BYPASS,
      email: process.env.TEST_USER_EMAIL_BYPASS ?? null
    };
  }

  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  return { id, email: session.user?.email ?? null };
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
