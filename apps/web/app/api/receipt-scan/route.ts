/**
 * POST /api/receipt-scan — Analyze a receipt image and extract line items.
 *
 * Auth: Required. Rate-limited to 20 scans per user per 24h.
 *
 * Fallback: when ANTHROPIC_API_KEY is unset, returns a stub structure
 * (`_stub: true`) so the client falls back to manual entry — no error.
 * Otherwise, sends the file to Claude Vision (lib/receiptParser.ts) scoped
 * to the caller's household categories.
 */
import { NextResponse } from "next/server";

import { env } from "../../../env";
import { isAllowedAttachmentMimeType, ATTACHMENT_MAX_SIZE_BYTES } from "../../../lib/attachments";
import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { enforceRateLimit } from "../../../lib/rateLimit";
import { parseReceiptImage } from "../../../lib/receiptParser";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(`receipt-scan:${user.id}`, 20, 24 * 60 * 60 * 1000);
  if (limited) return limited;

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

  if (!env.ANTHROPIC_API_KEY) {
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

  const categories = await prisma.category.findMany({
    where: { householdId: user.householdId, deletedAt: null, isIncome: false },
    select: { name: true },
    orderBy: { name: "asc" }
  });

  const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const result = await parseReceiptImage({
      imageBase64,
      mimeType: file.type,
      categoryNames: categories.map((c) => c.name)
    });
    return NextResponse.json(result);
  } catch (error) {
    // ReceiptParseError covers both request failures and structured-output
    // validation failures — either way the client falls back to manual entry.
    console.error("Receipt scan failed:", error);
    return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 502 });
  }
}
