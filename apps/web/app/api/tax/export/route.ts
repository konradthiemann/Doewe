/**
 * GET /api/tax/export?year=YYYY&includeReceipts=0|1&locale=de|en — Tax year PDF
 *
 * Authentifizierung: Pflicht (401). Liefert dasselbe steuerrelevante
 * Transaktions-Set wie GET /api/tax als PDF (Deckblatt + Kategorie-Tabelle +
 * optionaler Beleganhang). Belegbytes werden NUR aus diesem Haushalt geladen
 * und verlassen ihn nie (Cache-Control: private, no-store).
 *
 * Größenbudget (F2): Wenn `includeReceipts=1` und die Summe der
 * Beleg-`sizeBytes` das Budget von 50 MB überschreitet, antwortet der
 * Endpoint mit 413 statt Bytes nachzuladen — `{ error, totalBytes, limitBytes }`.
 *
 * Belege werden bewusst SEQUENZIELL einzeln nachgeladen (ein `findUnique`
 * pro Attachment), nicht per `findMany` mit `data` — das hält den
 * Speicher-Peak bei vielen/großen Belegen niedrig.
 */
import { NextResponse } from "next/server";

import { TAX_EXPORT_MAX_RECEIPT_BYTES } from "../../../../lib/attachments";
import { getSessionUser } from "../../../../lib/auth";
import { type TaxExportReceiptBytes, renderTaxExportPdf } from "../../../../lib/pdf/taxExport";
import { prisma } from "../../../../lib/prisma";
import { enforceRateLimit } from "../../../../lib/rateLimit";

import { TaxExportQuery } from "./schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(`tax-export:${user.id}`, 5, 10 * 60 * 1000);
  if (limited) return limited;

  const url = new URL(req.url);
  const parsed = TaxExportQuery.safeParse({
    year: url.searchParams.get("year") ?? undefined,
    includeReceipts: url.searchParams.get("includeReceipts") ?? undefined,
    locale: url.searchParams.get("locale") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { year, includeReceipts: includeReceiptsParam } = parsed.data;
  const includeReceipts = includeReceiptsParam === "1";

  const [household, sessionUserRecord] = await Promise.all([
    prisma.household.findUnique({ where: { id: user.householdId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { locale: true } })
  ]);
  const locale = parsed.data.locale ?? (sessionUserRecord?.locale === "en" ? "en" : "de");

  const transactions = await prisma.transaction.findMany({
    where: {
      account: { householdId: user.householdId },
      taxRelevant: true,
      occurredAt: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1))
      }
    },
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      amountCents: true,
      description: true,
      occurredAt: true,
      category: { select: { id: true, name: true } },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  const receipts: TaxExportReceiptBytes[] = [];
  if (includeReceipts) {
    const attachmentMetas = transactions.flatMap((tx) => tx.attachments);
    const totalBytes = attachmentMetas.reduce((sum, a) => sum + a.sizeBytes, 0);
    if (totalBytes > TAX_EXPORT_MAX_RECEIPT_BYTES) {
      return NextResponse.json(
        { error: "Receipts exceed the size budget", totalBytes, limitBytes: TAX_EXPORT_MAX_RECEIPT_BYTES },
        { status: 413 }
      );
    }

    // Sequential, not a single findMany({ select: { data: true } }) — see file header.
    for (const meta of attachmentMetas) {
      const attachment = await prisma.attachment.findUnique({
        where: { id: meta.id },
        select: { data: true }
      });
      if (!attachment) continue; // deleted between the metadata read and now — skip, placeholder handles it
      receipts.push({ id: meta.id, fileName: meta.fileName, mimeType: meta.mimeType, bytes: new Uint8Array(attachment.data) });
    }
  }

  const pdfBytes = await renderTaxExportPdf({
    householdName: household?.name ?? "",
    year,
    locale,
    generatedAt: new Date(),
    transactions,
    includeReceipts,
    receipts
  });

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="steuer-${year}.pdf"`,
      "Cache-Control": "private, no-store"
    }
  });
}
