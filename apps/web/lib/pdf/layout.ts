/**
 * Low-level PDF layout helpers for the tax year export (see `taxExport.ts`).
 * Page-break bookkeeping, a simple table renderer, and WinAnsi sanitization —
 * kept separate from the domain assembly logic in `taxExport.ts`.
 */
import { type PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

/** A4 portrait, in PDF points (1/72 inch). */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 50;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.45, 0.45, 0.48);
const LINE = rgb(0.75, 0.75, 0.77);

// StandardFonts.Helvetica only embeds WinAnsiEncoding (cp1252) glyphs (F4). The
// undefined slots in the 0x80-0x9F control range aren't mapped in cp1252 either
// — everything else up to 0xFF (ASCII + Latin-1 supplement, incl. German
// umlauts/ß) is encodable, so only >0xFF code points and these five gaps need
// the `?` fallback.
const WIN_ANSI_UNDEFINED_CODEPOINTS = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

/**
 * Replaces characters that `StandardFonts.Helvetica` (WinAnsi/cp1252) cannot
 * encode with `?`, so `page.drawText()` never throws on exotic Unicode (e.g.
 * emoji or CJK characters in a merchant name) — see F4.
 */
export function sanitizeWinAnsi(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code > 0xff || WIN_ANSI_UNDEFINED_CODEPOINTS.has(code)) return "?";
      return char;
    })
    .join("");
}

export type TableColumn = {
  header: string;
  width: number;
  align?: "left" | "right";
};

export type DrawRowOptions = {
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
};

/**
 * Draws a header-repeating table across as many pages as needed. Call
 * `newPage()` once up front, then `drawRow()` per line; page breaks and the
 * repeated column header are handled automatically.
 */
export class TableWriter {
  private page!: PDFPage;
  private cursorY = 0;
  readonly rowHeight = 16;
  readonly fontSize = 9;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly boldFont: PDFFont,
    private readonly columns: TableColumn[]
  ) {}

  get currentPage(): PDFPage {
    return this.page;
  }

  newPage(): PDFPage {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.cursorY = PAGE_HEIGHT - MARGIN;
    this.drawColumnHeader();
    return this.page;
  }

  private drawColumnHeader(): void {
    let x = MARGIN;
    for (const column of this.columns) {
      this.drawCell(column.header, x, column, this.boldFont, MUTED);
      x += column.width;
    }
    this.cursorY -= 12;
    this.page.drawLine({
      start: { x: MARGIN, y: this.cursorY },
      end: { x: PAGE_WIDTH - MARGIN, y: this.cursorY },
      thickness: 0.75,
      color: LINE
    });
    this.cursorY -= this.rowHeight;
  }

  /** Ensures at least `height` points remain before the bottom margin. */
  ensureSpace(height: number = this.rowHeight): void {
    if (this.cursorY - height < MARGIN) this.newPage();
  }

  drawRow(cells: string[], options: DrawRowOptions = {}): void {
    this.ensureSpace();
    let x = MARGIN;
    const font = options.bold ? this.boldFont : this.font;
    const color = options.color ?? INK;
    this.columns.forEach((column, index) => {
      this.drawCell(cells[index] ?? "", x, column, font, color);
      x += column.width;
    });
    this.cursorY -= this.rowHeight;
  }

  private drawCell(text: string, x: number, column: TableColumn, font: PDFFont, color: ReturnType<typeof rgb>): void {
    const sanitized = sanitizeWinAnsi(text);
    const textWidth = font.widthOfTextAtSize(sanitized, this.fontSize);
    const drawX = column.align === "right" ? x + column.width - textWidth : x;
    this.page.drawText(sanitized, { x: drawX, y: this.cursorY, size: this.fontSize, font, color });
  }

  /** Blank vertical space, e.g. between a category group and its subtotal. */
  drawSpacer(height: number): void {
    this.ensureSpace(height);
    this.cursorY -= height;
  }

  drawRule(): void {
    this.ensureSpace(4);
    this.page.drawLine({
      start: { x: MARGIN, y: this.cursorY + 10 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.cursorY + 10 },
      thickness: 0.5,
      color: LINE
    });
  }
}

export { INK, MUTED, LINE };
