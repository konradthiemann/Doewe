import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../lib/i18n";

import ReceiptReview from "./ReceiptReview";
import { ToastProvider } from "./ui/Toast";

const fetchMock = vi.fn();

const CATEGORIES = [
  { id: "cat-food", name: "Lebensmittel", isIncome: false, isTaxRelevant: false },
  { id: "cat-office", name: "Arbeitsmittel", isIncome: false, isTaxRelevant: true },
  { id: "cat-salary", name: "Gehalt", isIncome: true, isTaxRelevant: false }
];
const ACCOUNTS = [{ id: "acc-1", name: "Hauptkonto" }];

type ScanItem = { name: string; quantity: number; unitPriceCents: number; totalCents: number; suggestedCategory?: string };

function setup(items: ScanItem[], date = "2026-10-17") {
  const onComplete = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ToastProvider>
          <ReceiptReview
            scanResult={{ merchant: "Papier Müller", date, items, totalCents: 0 }}
            categories={CATEGORIES}
            accounts={ACCOUNTS}
            receiptImage={null}
            onBack={() => {}}
            onComplete={onComplete}
          />
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
  return { onComplete };
}

const taxSwitch = () => screen.getByRole("checkbox", { name: "Steuerrelevant" }) as HTMLInputElement;
const dateField = () => document.querySelector('input[type="date"]') as HTMLInputElement;

/** Body of the batch request that booked the receipt. */
function bookedBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([input]) => String(input) === "/api/transactions/batch");
  if (!call) throw new Error("no batch request was sent");
  return JSON.parse((call[1] as RequestInit).body as string);
}

async function book(user: ReturnType<typeof userEvent.setup>, onComplete: ReturnType<typeof vi.fn>) {
  const buttons = screen.getAllByRole("button");
  await user.click(buttons[buttons.length - 1]!);
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
}

const PAPER: ScanItem = { name: "Druckerpapier", quantity: 1, unitPriceCents: 599, totalCents: 599, suggestedCategory: "Arbeitsmittel" };
const MILK: ScanItem = { name: "Milch", quantity: 2, unitPriceCents: 129, totalCents: 258, suggestedCategory: "Lebensmittel" };

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ transactions: [{ id: "tx-1" }] }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ReceiptReview: tax relevance", () => {
  it("sends no taxRelevant while the switch is untouched and shows what the categories imply", async () => {
    const user = userEvent.setup();
    const { onComplete } = setup([PAPER]);

    // The only category is tax-relevant → the bookings will inherit "on".
    expect(taxSwitch().checked).toBe(true);
    expect(taxSwitch().indeterminate).toBe(false);

    await book(user, onComplete);
    expect(bookedBody()).not.toHaveProperty("taxRelevant");
  });

  it("shows off for categories that are not tax-relevant and still sends nothing", async () => {
    const user = userEvent.setup();
    const { onComplete } = setup([MILK]);

    expect(taxSwitch().checked).toBe(false);
    expect(taxSwitch().indeterminate).toBe(false);

    await book(user, onComplete);
    expect(bookedBody()).not.toHaveProperty("taxRelevant");
  });

  it("shows a mixed state when the categories differ", () => {
    setup([PAPER, MILK]);
    expect(taxSwitch().indeterminate).toBe(true);
    expect(taxSwitch()).toHaveAttribute("aria-checked", "mixed");
  });

  it("sends the explicit choice once the user has touched the switch — also an explicit off", async () => {
    const user = userEvent.setup();
    const { onComplete } = setup([PAPER]);

    await user.click(taxSwitch()); // inherited on → explicit off
    expect(taxSwitch().checked).toBe(false);

    await book(user, onComplete);
    expect(bookedBody().taxRelevant).toBe(false);
  });

  it("sends an explicit on for categories that are not tax-relevant", async () => {
    const user = userEvent.setup();
    const { onComplete } = setup([MILK]);

    await user.click(taxSwitch());
    expect(taxSwitch().checked).toBe(true);

    await book(user, onComplete);
    expect(bookedBody().taxRelevant).toBe(true);
  });
});

describe("ReceiptReview: receipt date", () => {
  it("keeps a scanned calendar day", async () => {
    const user = userEvent.setup();
    const { onComplete } = setup([MILK], "2026-10-17");
    expect(dateField().value).toBe("2026-10-17");

    await book(user, onComplete);
    expect(bookedBody().receiptDate).toBe("2026-10-17");
  });

  it("falls back to today in Berlin when the scan result has no usable date", async () => {
    // 1 Nov 2026, 00:30 in Berlin — still 31 Oct in UTC and in Los Angeles.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T23:30:00.000Z") });
    const user = userEvent.setup();
    const { onComplete } = setup([MILK], "17.10.26");
    expect(dateField().value).toBe("2026-11-01");

    await book(user, onComplete);
    expect(bookedBody().receiptDate).toBe("2026-11-01");
  });
});

describe("ReceiptReview: line totals", () => {
  it("books whole cents after a fractional quantity was entered and totals only named lines", async () => {
    const user = userEvent.setup();
    const { onComplete } = setup([
      { name: "Käse", quantity: 1, unitPriceCents: 1299, totalCents: 1299, suggestedCategory: "Lebensmittel" },
      { name: "", quantity: 1, unitPriceCents: 5000, totalCents: 5000, suggestedCategory: "Lebensmittel" }
    ]);

    // Set in one step: the field snaps an emptied value back to 1, so it cannot be retyped key by key.
    fireEvent.change(screen.getAllByRole("spinbutton")[0]!, { target: { value: "0.345" } });

    // 0.345 × 12.99 = 4.48155 → 4,48; the unnamed 50,00 line is not booked and not in the total.
    await waitFor(() => expect(screen.getByText(/Gesamt.*4,48/)).toBeInTheDocument());

    await book(user, onComplete);
    const groups = bookedBody().groups as Array<{ items: Array<{ name: string; totalCents: number }> }>;
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toEqual([expect.objectContaining({ name: "Käse", totalCents: 448 })]);
  });
});
