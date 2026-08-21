/**
 * Renders the tax year PDF export: a cover page, a category-grouped
 * transaction table, and (optionally) a receipt appendix.
 *
 * Deliberately Prisma-free — the caller (the API route) loads all data
 * (transactions + receipt bytes) up front and passes it in, so this module
 * is unit-testable without a database and has no HTTP concerns either.
 */
import { formatEuro, fromCents, groupTaxTransactionsByCategory, type TaxTransactionInput } from "@doewe/shared";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { type Locale, translate } from "../locales/translate";

import { CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, TableWriter, sanitizeWinAnsi } from "./layout";

export type TaxExportReceiptBytes = {
  /** Attachment id, matches `TaxTransactionInput["attachments"][number]["id"]`. */
  id: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type RenderTaxExportPdfInput = {
  householdName: string;
  year: number;
  locale: Locale;
  generatedAt: Date;
  transactions: TaxTransactionInput[];
  /** Whether the receipt appendix should be rendered at all (F1/F2). */
  includeReceipts: boolean;
  /**
   * Already-loaded receipt bytes for the attachments to embed. Empty when
   * `includeReceipts` is false. Matched against `transaction.attachments[].id`.
   */
  receipts: TaxExportReceiptBytes[];
};

const RECEIPT_SUFFIXES = "abcdefghij".split("");
const WHITE = rgb(1, 1, 1);
const HEADER_RECT_HEIGHT = 34;

/** Sorted rendering order: categories as in `categorySums` (|total| desc), transactions within a category ascending by date. */
function buildRenderOrder(
  transactions: TaxTransactionInput[],
  categorySums: ReturnType<typeof groupTaxTransactionsByCategory>["categorySums"]
): TaxTransactionInput[] {
  const byCategory = new Map<string | null, TaxTransactionInput[]>();
  for (const tx of transactions) {
    const key = tx.category?.id ?? null;
    const list = byCategory.get(key) ?? [];
    list.push(tx);
    byCategory.set(key, list);
  }

  const ordered: TaxTransactionInput[] = [];
  for (const categorySum of categorySums) {
    const list = (byCategory.get(categorySum.categoryId) ?? [])
      .slice()
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    ordered.push(...list);
  }
  return ordered;
}

/** "12" for a single receipt, "12a"/"12b" for multiple (F1). */
function receiptRefsFor(number: number, attachmentCount: number): string[] {
  if (attachmentCount === 0) return [];
  if (attachmentCount === 1) return [String(number)];
  return Array.from({ length: attachmentCount }, (_, i) => `${number}${RECEIPT_SUFFIXES[i] ?? i}`);
}

function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", { timeZone: "UTC" }).format(d);
}

export async function renderTaxExportPdf(input: RenderTaxExportPdfInput): Promise<Uint8Array> {
  const { locale } = input;
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);

  const grouping = groupTaxTransactionsByCategory(input.transactions);
  const renderOrder = buildRenderOrder(input.transactions, grouping.categorySums);

  // Assign the running number + receipt reference labels once, in render order,
  // so the cover page counts and the table/appendix all agree.
  const numbered = renderOrder.map((tx, index) => ({
    tx,
    number: index + 1,
    receiptRefs: receiptRefsFor(index + 1, tx.attachments.length)
  }));
  const withReceiptCount = input.transactions.filter((tx) => tx.attachments.length > 0).length;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  drawCoverPage(doc, font, boldFont, t, {
    householdName: input.householdName,
    year: input.year,
    generatedAt: input.generatedAt,
    locale,
    positionCount: input.transactions.length,
    withReceiptCount,
    totalIncomeCents: grouping.totalIncomeCents,
    totalExpenseCents: grouping.totalExpenseCents,
    totalCents: grouping.totalCents
  });

  if (numbered.length > 0) {
    drawTransactionTable(doc, font, boldFont, t, locale, input.year, numbered, grouping.categorySums);
  }

  if (input.includeReceipts) {
    const receiptsById = new Map(input.receipts.map((r) => [r.id, r]));
    for (const entry of numbered) {
      for (let i = 0; i < entry.tx.attachments.length; i++) {
        const attachment = entry.tx.attachments[i];
        const ref = entry.receiptRefs[i];
        const heading = t("tax.export.pdf.receiptHeading", {
          ref,
          date: formatDate(entry.tx.occurredAt, locale),
          description: entry.tx.description,
          amount: formatEuro(fromCents(entry.tx.amountCents), locale)
        });
        const bytes = receiptsById.get(attachment.id);
        await addReceiptPage(doc, font, boldFont, heading, attachment.mimeType, attachment.fileName, bytes?.bytes, t);
      }
    }
  }

  return doc.save();
}

type CoverPageData = {
  householdName: string;
  year: number;
  generatedAt: Date;
  locale: Locale;
  positionCount: number;
  withReceiptCount: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  totalCents: number;
};

function drawCoverPage(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  t: (key: string, vars?: Record<string, string | number>) => string,
  data: CoverPageData
): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN - 20;

  const drawLine = (text: string, options: { size?: number; bold?: boolean; gap?: number; muted?: boolean } = {}) => {
    const size = options.size ?? 11;
    page.drawText(sanitizeWinAnsi(text), {
      x: MARGIN,
      y,
      size,
      font: options.bold ? boldFont : font,
      color: options.muted ? rgb(0.45, 0.45, 0.48) : rgb(0.1, 0.1, 0.12)
    });
    y -= options.gap ?? size + 10;
  };

  drawLine(t("tax.export.pdf.title", { year: data.year }), { size: 20, bold: true, gap: 34 });
  drawLine(data.householdName, { size: 13, bold: true, gap: 22 });
  drawLine(t("tax.export.pdf.generatedAt", { date: formatDate(data.generatedAt, data.locale) }), {
    size: 10,
    muted: true,
    gap: 26
  });

  drawLine(t("tax.export.pdf.positionsCount", { count: data.positionCount }), { gap: 18 });
  drawLine(t("tax.export.pdf.withReceiptCount", { count: data.withReceiptCount }), { gap: 26 });

  if (data.positionCount === 0) {
    drawLine(t("tax.export.pdf.noTransactions"), { muted: true, gap: 26 });
  } else {
    drawLine(
      `${t("tax.export.pdf.totalExpense")}: ${formatEuro(fromCents(data.totalExpenseCents), data.locale)}`,
      { gap: 18 }
    );
    drawLine(
      `${t("tax.export.pdf.totalIncome")}: ${formatEuro(fromCents(data.totalIncomeCents), data.locale)}`,
      { gap: 18 }
    );
    drawLine(`${t("tax.export.pdf.total")}: ${formatEuro(fromCents(data.totalCents), data.locale)}`, {
      bold: true,
      gap: 30
    });
  }

  // Belegvorhaltepflicht disclaimer, wrapped to the content width.
  const disclaimer = t("tax.export.pdf.disclaimer");
  for (const line of wrapText(disclaimer, font, 9, CONTENT_WIDTH)) {
    drawLine(line, { size: 9, muted: true, gap: 13 });
  }
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, maxWidth: number): string[] {
  const sanitized = sanitizeWinAnsi(text);
  const words = sanitized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawTransactionTable(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: Locale,
  year: number,
  numbered: Array<{ tx: TaxTransactionInput; number: number; receiptRefs: string[] }>,
  categorySums: ReturnType<typeof groupTaxTransactionsByCategory>["categorySums"]
): void {
  const columns = [
    { header: t("tax.export.pdf.columnNumber"), width: 30 },
    { header: t("tax.export.pdf.columnDate"), width: 65 },
    { header: t("tax.export.pdf.columnDescription"), width: 210 },
    { header: t("tax.export.pdf.columnAmount"), width: 80, align: "right" as const },
    { header: t("tax.export.pdf.columnReceipt"), width: 90 }
  ];
  const table = new TableWriter(doc, font, boldFont, columns);
  table.newPage();

  let index = 0;
  for (const categorySum of categorySums) {
    const categoryLabel = categorySum.categoryName ?? t("tax.uncategorized");
    table.drawRow([`— ${categoryLabel} —`, "", "", "", ""], { bold: true });

    while (index < numbered.length && (numbered[index].tx.category?.id ?? null) === categorySum.categoryId) {
      const entry = numbered[index];
      table.drawRow([
        String(entry.number),
        formatDate(entry.tx.occurredAt, locale),
        entry.tx.description,
        formatEuro(fromCents(entry.tx.amountCents), locale),
        entry.receiptRefs.length > 0 ? entry.receiptRefs.join(", ") : "—"
      ]);
      index += 1;
    }

    table.drawRow(["", "", t("tax.export.pdf.subtotal"), formatEuro(fromCents(categorySum.totalCents), locale), ""], {
      bold: true
    });
    table.drawSpacer(8);
  }

  table.drawRule();
  const grandTotal = categorySums.reduce((sum, c) => sum + c.totalCents, 0);
  table.drawRow(["", "", t("tax.export.pdf.grandTotal", { year }), formatEuro(fromCents(grandTotal), locale), ""], {
    bold: true
  });
}

/**
 * Adds one receipt page to the appendix. Every embed/parse attempt is wrapped
 * in its own try/catch — a single corrupt or unsupported receipt must not
 * abort the whole export (defined behaviour, not an error).
 */
async function addReceiptPage(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  heading: string,
  mimeType: string,
  fileName: string,
  bytes: Uint8Array | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<void> {
  if (!bytes) {
    drawPlaceholderPage(doc, font, boldFont, heading, t("tax.export.pdf.receiptPlaceholder", { fileName }));
    return;
  }

  // F3: webp receipts get a placeholder instead of conversion, no embed attempt.
  if (mimeType === "image/webp") {
    drawPlaceholderPage(doc, font, boldFont, heading, t("tax.export.pdf.receiptPlaceholder", { fileName }));
    return;
  }

  try {
    if (mimeType === "application/pdf") {
      await appendReceiptPdf(doc, font, boldFont, heading, bytes);
      return;
    }
    if (mimeType === "image/jpeg" || mimeType === "image/png") {
      const image = mimeType === "image/jpeg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawReceiptHeading(page, boldFont, heading);
      const maxWidth = CONTENT_WIDTH;
      const maxHeight = PAGE_HEIGHT - MARGIN * 2 - HEADER_RECT_HEIGHT;
      const scaled = image.scaleToFit(maxWidth, maxHeight);
      page.drawImage(image, {
        x: MARGIN + (maxWidth - scaled.width) / 2,
        y: MARGIN + (maxHeight - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height
      });
      return;
    }
    // Unexpected mime type slipped through validation somewhere — placeholder, no crash.
    drawPlaceholderPage(doc, font, boldFont, heading, t("tax.export.pdf.receiptPlaceholder", { fileName }));
  } catch (error) {
    console.error(`Tax export: failed to embed receipt "${fileName}" (${mimeType}):`, error);
    drawPlaceholderPage(doc, font, boldFont, heading, t("tax.export.pdf.receiptPlaceholder", { fileName }));
  }
}

async function appendReceiptPdf(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  heading: string,
  bytes: Uint8Array
): Promise<void> {
  const srcDoc = await PDFDocument.load(bytes);
  const pages = await doc.copyPages(srcDoc, srcDoc.getPageIndices());
  pages.forEach((page, i) => {
    doc.addPage(page);
    // Overlay the heading on the first page only, so multi-page receipts stay readable.
    if (i === 0) drawReceiptHeading(page, boldFont, heading);
  });
  void font; // font is unused here but kept in signature for a consistent call shape
}

function drawReceiptHeading(page: import("pdf-lib").PDFPage, boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>, heading: string): void {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - HEADER_RECT_HEIGHT, width, height: HEADER_RECT_HEIGHT, color: WHITE });
  page.drawText(sanitizeWinAnsi(heading), {
    x: MARGIN,
    y: height - HEADER_RECT_HEIGHT / 2 - 4,
    size: 10,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.12)
  });
}

function drawPlaceholderPage(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  heading: string,
  message: string
): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawReceiptHeading(page, boldFont, heading);
  page.drawText(sanitizeWinAnsi(message), {
    x: MARGIN,
    y: PAGE_HEIGHT / 2,
    size: 12,
    font,
    color: rgb(0.45, 0.45, 0.48)
  });
}
