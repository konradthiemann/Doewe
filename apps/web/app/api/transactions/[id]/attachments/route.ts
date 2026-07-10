/**
 * GET  /api/transactions/[id]/attachments — Beleg-Metadaten einer Transaktion
 * POST /api/transactions/[id]/attachments — Beleg hochladen (multipart/form-data, Feld "file")
 *
 * Authentifizierung: Pflicht (401). Autorisierung: Transaktion muss dem Nutzer
 * gehören (sonst 404). Upload-Limits: MIME-Whitelist (415), max. 5 MB (413),
 * max. 5 Belege pro Transaktion (400). Die Antworten enthalten nie die
 * Datei-Bytes — Download läuft über GET /api/attachments/[id].
 */
import { NextResponse } from "next/server";

import {
  ATTACHMENTS_MAX_PER_TRANSACTION,
  ATTACHMENT_MAX_SIZE_BYTES,
  isAllowedAttachmentMimeType,
  sanitizeAttachmentFileName
} from "../../../../../lib/attachments";
import { getSessionUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

const attachmentMetaSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true
} as const;

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const transaction = await prisma.transaction.findFirst({
    where: { id: params.id, account: { userId: user.id } },
    select: { id: true }
  });
  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const items = await prisma.attachment.findMany({
    where: { transactionId: transaction.id },
    select: attachmentMetaSelect,
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json(items);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const transaction = await prisma.transaction.findFirst({
    where: { id: params.id, account: { userId: user.id } },
    select: { id: true }
  });
  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!isAllowedAttachmentMimeType(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  // Die tatsächliche Größe zählt, nicht die vom Client gemeldete.
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > ATTACHMENT_MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const count = await prisma.attachment.count({ where: { transactionId: transaction.id } });
  if (count >= ATTACHMENTS_MAX_PER_TRANSACTION) {
    return NextResponse.json({ error: "Attachment limit reached" }, { status: 400 });
  }

  const created = await prisma.attachment.create({
    data: {
      transactionId: transaction.id,
      fileName: sanitizeAttachmentFileName(file.name),
      mimeType: file.type,
      sizeBytes: buffer.byteLength,
      data: buffer
    },
    select: attachmentMetaSelect
  });

  return NextResponse.json(created, { status: 201 });
}
