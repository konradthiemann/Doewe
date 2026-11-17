import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unit-Tests für lib/receiptParser.ts — das Anthropic-SDK wird komplett
// gemockt, es geht kein Request raus. Hintergrund (Prod, 2026-11-17): Ein
// einzelner Kategorie-Vorschlag außerhalb der Haushaltsliste bzw. eine
// abgeschnittene JSON-Antwort haben den ganzen Scan mit AI_UNAVAILABLE
// verworfen.

const createMock = vi.fn();

// env.ts validiert DATABASE_URL & Co. schon beim Import — dieser Test braucht
// keine DB, daher wird nur der API-Key bereitgestellt.
vi.mock("../env", () => ({ env: { ANTHROPIC_API_KEY: "sk-ant-test-key" } }));

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = { create: createMock };
  }
  return { default: Anthropic };
});

const CATEGORIES = ["Drogerie/Haushalt", "Lebensmittel", "Mobilität/Tanken"];

function item(name: string, suggestedCategory: string | null) {
  return { name, quantity: 1, unitPriceCents: 199, totalCents: 199, suggestedCategory };
}

function validOutput(items = [item("Milch", "Lebensmittel")]) {
  return {
    merchant: "REWE",
    date: "2026-11-17",
    items,
    subtotalCents: null,
    taxCents: null,
    totalCents: 199 * items.length,
    confidence: "high"
  };
}

function apiResponse(text: string, stopReason = "end_turn") {
  return {
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    usage: { input_tokens: 1000, output_tokens: 50 }
  };
}

async function loadParser() {
  return import("../lib/receiptParser");
}

const input = { imageBase64: "aGVsbG8=", mimeType: "image/png", categoryNames: CATEGORIES };

beforeEach(() => {
  createMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseReceiptImage", () => {
  it("returns the validated result for a well-formed response", async () => {
    createMock.mockResolvedValueOnce(apiResponse(JSON.stringify(validOutput())));
    const { parseReceiptImage } = await loadParser();

    const result = await parseReceiptImage(input);

    expect(result.merchant).toBe("REWE");
    expect(result.items).toEqual([item("Milch", "Lebensmittel")]);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("drops a category suggestion outside the household list instead of failing the scan", async () => {
    const output = validOutput([item("Milch", "Lebensmittel"), item("Spülmittel", "Haushalt")]);
    createMock.mockResolvedValueOnce(apiResponse(JSON.stringify(output)));
    const { parseReceiptImage } = await loadParser();

    const result = await parseReceiptImage(input);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].suggestedCategory).toBe("Lebensmittel");
    expect(result.items[1].suggestedCategory).toBeNull();
  });

  it("maps a case- or Unicode-variant suggestion onto the canonical category name", async () => {
    const decomposed = " Mobilität/Tanken ".normalize("NFD");
    const output = validOutput([item("Zahnpasta", "drogerie/haushalt"), item("Super E10", decomposed)]);
    createMock.mockResolvedValueOnce(apiResponse(JSON.stringify(output)));
    const { parseReceiptImage } = await loadParser();

    const result = await parseReceiptImage(input);

    expect(result.items.map((i) => i.suggestedCategory)).toEqual(["Drogerie/Haushalt", "Mobilität/Tanken"]);
  });

  it("retries once when the response is truncated JSON and returns the second result", async () => {
    createMock
      .mockResolvedValueOnce(apiResponse('{"merchant":"REWE","items":[{"name":"Bio Mil', "max_tokens"))
      .mockResolvedValueOnce(apiResponse(JSON.stringify(validOutput())));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseReceiptImage } = await loadParser();

    const result = await parseReceiptImage(input);

    expect(result.merchant).toBe("REWE");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry with an error that names the stop reason", async () => {
    createMock.mockResolvedValue(apiResponse('{"merchant":"REWE","items":[{"name":"Bio Mil', "refusal"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseReceiptImage, ReceiptParseError } = await loadParser();

    const error = await parseReceiptImage(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ReceiptParseError);
    expect((error as Error).message).toContain("stop_reason=refusal");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on request failures (the SDK already retries transport errors)", async () => {
    createMock.mockRejectedValue(new Error("529 overloaded"));
    const { parseReceiptImage, ReceiptParseError } = await loadParser();

    const error = await parseReceiptImage(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ReceiptParseError);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
