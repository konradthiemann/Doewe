/**
 * PUT /api/me/locale — Synchronisiert die Sprachwahl (client-seitig in
 * localStorage) ins User-Feld, damit server-gerenderte Push-Texte die richtige
 * Sprache treffen (Teil C).
 *
 * Authentifizierung: Pflicht (401 sonst).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

const LocaleInput = z.object({ locale: z.enum(["de", "en"]) });

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = LocaleInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { locale: parsed.data.locale } });
  return NextResponse.json({ ok: true });
}
