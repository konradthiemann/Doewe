/**
 * GET    /api/attachments/[id] — Beleg-Datei binär ausliefern (inline)
 * DELETE /api/attachments/[id] — Beleg löschen
 *
 * Authentifizierung: Pflicht (401). Autorisierung: Beleg muss über
 * Transaktion → Account dem Nutzer gehören (sonst 404). Dies ist die einzige
 * Stelle, an der die Bytes-Spalte `data` selektiert wird.
 */
import { NextResponse } from "next/server";

import { sanitizeAttachmentFileName } from "../../../../lib/attachments";
import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attachment = await prisma.attachment.findFirst({
    where: { id: params.id, transaction: { account: { userId: user.id } } }
  });
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": `inline; filename="${sanitizeAttachmentFileName(attachment.fileName)}"`,
      "Cache-Control": "private, no-store"
    }
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attachment = await prisma.attachment.findFirst({
    where: { id: params.id, transaction: { account: { userId: user.id } } },
    select: { id: true }
  });
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  await prisma.attachment.delete({ where: { id: attachment.id } });
  return new NextResponse(null, { status: 204 });
}
