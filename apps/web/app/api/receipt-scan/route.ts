/**
 * POST /api/receipt-scan — Analyze a receipt image and extract line items.
 *
 * STUB: Currently returns an empty structure. The actual Claude Vision AI
 * integration is tracked in Issue #53.
 *
 * Auth: Required.
 */
import { NextResponse } from "next/server";

import { isAllowedAttachmentMimeType, ATTACHMENT_MAX_SIZE_BYTES } from "../../../lib/attachments";
import { getSessionUser } from "../../../lib/auth";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!isAllowedAttachmentMimeType(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  // STUB: AI integration pending (Issue #53)
  return NextResponse.json({
    merchant: null,
    date: new Date().toISOString().slice(0, 10),
    items: [],
    subtotalCents: 0,
    taxCents: null,
    totalCents: 0,
    confidence: "none",
    _stub: true
  });
}
