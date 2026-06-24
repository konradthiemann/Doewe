/**
 * POST /api/demo/seed
 *
 * Öffentlicher (bewusst NICHT auth-geschützter) Endpoint für den Demo-Modus
 * der Login-Seite. Stellt den geteilten Demo-User samt 36 Monaten
 * Beispieldaten sicher und ist idempotent.
 *
 * Sicherheit: Die Operation ist strikt auf den fest verdrahteten Demo-Account
 * (`DEMO_ACCOUNT_ID`) begrenzt und akzeptiert keinerlei Request-Body. Sie kann
 * keine fremden Nutzerdaten lesen oder verändern.
 *
 * Muss im `middleware.ts`-Matcher von der Auth-Pflicht ausgenommen sein
 * (`api/demo`), da der Aufruf vor dem Login erfolgt.
 */
import { NextResponse } from "next/server";

import { ensureDemoData } from "../../../../lib/demoData";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await ensureDemoData(prisma);
    return NextResponse.json({ ok: true, refreshed: result.refreshed });
  } catch {
    return NextResponse.json({ error: "Demo seed failed" }, { status: 500 });
  }
}
