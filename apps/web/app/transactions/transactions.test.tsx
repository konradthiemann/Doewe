import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../components/ui/Toast";
import { I18nProvider } from "../../lib/i18n";

// Not part of these tests: the server action behind the forms (Prisma/auth)
// and the IndexedDB-backed offline outbox.
vi.mock("../actions/categories", () => ({ createCategoryAction: vi.fn() }));
vi.mock("../../lib/offline/queueOfflineTransaction", () => ({ queueOfflineTransaction: vi.fn() }));
vi.mock("../../lib/offline/useOutbox", () => ({ useOutboxEntries: () => [] }));

const { default: TransactionsPage } = await import("./page");

// The list has to reproduce the review's figures for a month from the same
// rows. All fixtures are fixed UTC instants around the Berlin month boundaries,
// so the expectations hold in every process time zone (the browser can be
// anywhere): run with TZ=UTC, Europe/Berlin and America/Los_Angeles.

const CATEGORIES = [
  { id: "cat-food", name: "Lebensmittel" },
  { id: "cat-salary", name: "Gehalt" },
  { id: "cat-savings", name: " Sparen " }
];

const tx = (
  id: string,
  description: string,
  occurredAt: string,
  amountCents: number,
  categoryId: string | null,
  recurringTransactionId: string | null = null
) => ({
  id,
  accountId: "acc-1",
  description,
  occurredAt,
  amountCents,
  categoryId,
  recurringTransactionId
});

const TRANSACTIONS = [
  // 30 Sep 2026, 23:30 in Berlin — the last minutes of September.
  tx("t-sep", "Letzter September", "2026-09-30T21:30:00.000Z", -777, "cat-food"),
  // 1 Oct 2026, 00:30 in Berlin — still 30 Sep in UTC.
  tx("t-oct-first", "Erster Oktober", "2026-09-30T22:30:00.000Z", -1000, "cat-food"),
  // Booked for a standing order (automatically, or a manual payment recognised as its booking).
  tx("t-salary", "Gehalt Oktober", "2026-10-15T10:00:00.000Z", 300000, "cat-salary", "rec-salary"),
  tx("t-deposit", "Sparrate", "2026-10-20T10:00:00.000Z", -20000, "cat-savings"),
  tx("t-withdrawal", "Entnahme", "2026-10-25T11:00:00.000Z", 5000, "cat-savings"),
  // 31 Oct 2026, 23:30 in Berlin — the last selected day has to count in full.
  tx("t-oct-last", "Letzter Oktober", "2026-10-31T22:30:00.000Z", -2500, "cat-food"),
  // 1 Nov 2026, 00:30 in Berlin — still 31 Oct in UTC.
  tx("t-nov", "Erster November", "2026-10-31T23:30:00.000Z", -9999, null)
];

/** A standing order due every month: 950,00 € rent, first booked in January 2026. */
const RECURRING = [
  {
    id: "rec-rent",
    accountId: "acc-1",
    amountCents: -95000,
    description: "Miete",
    categoryId: "cat-food",
    frequency: "MONTHLY",
    intervalMonths: 1,
    dayOfMonth: 1,
    nextOccurrence: "2026-01-01T11:00:00.000Z"
  },
  {
    id: "rec-salary",
    accountId: "acc-1",
    amountCents: 300000,
    description: "Gehalt",
    categoryId: "cat-salary",
    frequency: "MONTHLY",
    intervalMonths: 1,
    dayOfMonth: 15,
    nextOccurrence: "2026-01-15T11:00:00.000Z"
  }
];
let recurringResponse: unknown[] = [];

const fetchMock = vi.fn();

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function setup(searchParams = "") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NuqsTestingAdapter searchParams={searchParams} hasMemory>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ToastProvider>
            <TransactionsPage />
          </ToastProvider>
        </I18nProvider>
      </QueryClientProvider>
    </NuqsTestingAdapter>
  );
}

/** Descriptions of the bookings currently listed, in list order. */
function listedDescriptions(): string[] {
  const panel = document.getElementById("tab-panel-transactions");
  if (!panel) throw new Error("transactions panel not rendered");
  return within(panel)
    .queryAllByRole("button", { name: /^Transaktion verwalten/ })
    .map((button) => button.closest("li")?.querySelector("p")?.textContent ?? "");
}

/** Text of the totals bar above the list (whitespace collapsed). */
function totalsBar(): string {
  const bar = document.querySelector('[aria-live="polite"]');
  return (bar?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Waits until bookings (one of them is `visibleDescription`) and categories are loaded. */
async function loaded(visibleDescription = "Gehalt Oktober") {
  await screen.findByText(visibleDescription);
  // Categories decide what counts as savings — wait until they are there too.
  await waitFor(() => expect(screen.getAllByRole("option", { name: "Gehalt" }).length).toBeGreaterThan(0));
}

beforeEach(() => {
  recurringResponse = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/recurring-transactions/skips")) return jsonResponse([]);
    if (url.startsWith("/api/recurring-transactions")) return jsonResponse(recurringResponse);
    if (url.startsWith("/api/transactions")) return jsonResponse(TRANSACTIONS);
    if (url.startsWith("/api/categories")) return jsonResponse(CATEGORIES);
    if (url.startsWith("/api/accounts")) return jsonResponse([{ id: "acc-1", name: "Hauptkonto" }]);
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transaction list: date range", () => {
  it("includes the whole last day and nothing of the next month", async () => {
    setup("?from=2026-10-01&to=2026-10-31");
    await loaded();

    expect(listedDescriptions().sort()).toEqual(
      ["Entnahme", "Erster Oktober", "Gehalt Oktober", "Letzter Oktober", "Sparrate"].sort()
    );
    expect(screen.queryByText("Erster November")).not.toBeInTheDocument();
    expect(screen.queryByText("Letzter September")).not.toBeInTheDocument();
  });

  it("shows each booking on its Berlin day", async () => {
    setup();
    await loaded();

    const row = (description: string) => screen.getByText(description).closest("li") as HTMLElement;
    expect(within(row("Erster November")).getByText("01.11.2026 00:30")).toBeInTheDocument();
    expect(within(row("Letzter Oktober")).getByText("31.10.2026 23:30")).toBeInTheDocument();
    expect(within(row("Erster Oktober")).getByText("01.10.2026 00:30")).toBeInTheDocument();
  });
});

describe("transaction list: totals of a month", () => {
  it("separates income, outcome and savings and nets them", async () => {
    setup("?from=2026-10-01&to=2026-10-31");
    await loaded();

    const bar = totalsBar();
    expect(bar).toContain("+3.000,00 €"); // salary only — the savings withdrawal is not income
    expect(bar).toContain("-35,00 €"); // 10.00 + 25.00 — the savings deposit is not outcome
    expect(bar).toContain("Gespart: 150,00 €"); // 200.00 deposited − 50.00 withdrawn
    expect(bar).toContain("Netto: +2.815,00 €"); // 3000 − 35 − 150 = plain sum of all amounts
  });

  it("type outcome: only expenses, no savings deposits", async () => {
    setup("?from=2026-10-01&to=2026-10-31&filter=outcome");
    await loaded("Letzter Oktober");

    expect(listedDescriptions().sort()).toEqual(["Erster Oktober", "Letzter Oktober"]);
    const bar = totalsBar();
    expect(bar).toContain("-35,00 €");
    expect(bar).not.toContain("Gespart");
    expect(bar).not.toContain("Netto");
  });

  it("type income: no savings withdrawals", async () => {
    setup("?from=2026-10-01&to=2026-10-31&filter=income");
    await loaded();

    expect(listedDescriptions()).toEqual(["Gehalt Oktober"]);
    expect(totalsBar()).toContain("+3.000,00 €");
    expect(totalsBar()).not.toContain("Gespart");
  });

  it("type savings: deposits and withdrawals of every savings category", async () => {
    setup("?from=2026-10-01&to=2026-10-31&filter=savings");
    await loaded("Sparrate");
    await waitFor(() => expect(listedDescriptions().sort()).toEqual(["Entnahme", "Sparrate"]));

    const bar = totalsBar();
    expect(bar).toContain("Gespart: 150,00 €");
    expect(bar).not.toContain("Netto");
    expect(screen.getByRole("button", { name: "Sparen" })).toBeInTheDocument();
  });
});

describe("transaction list: month picker", () => {
  it("lists the months that have bookings, newest first, in the UI language", async () => {
    setup();
    await loaded();

    const picker = screen.getByLabelText("Monat") as HTMLSelectElement;
    expect(Array.from(picker.options).map((option) => option.textContent)).toEqual([
      "Alle Monate",
      "November 2026",
      "Oktober 2026",
      "September 2026"
    ]);
    expect(picker.value).toBe("");
  });

  it("choosing a month filters the list to exactly that month and fills from/to", async () => {
    const user = userEvent.setup();
    setup();
    await loaded();

    await user.selectOptions(screen.getByLabelText("Monat"), "2026-10");

    await waitFor(() => expect(screen.queryByText("Erster November")).not.toBeInTheDocument());
    expect(listedDescriptions()).toHaveLength(5);
    expect(screen.getByLabelText("Von")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Bis")).toHaveValue("2026-10-31");
    expect(totalsBar()).toContain("-35,00 €");

    await user.selectOptions(screen.getByLabelText("Monat"), "");
    await screen.findByText("Erster November");
    expect(screen.getByLabelText("Von")).toHaveValue("");
    expect(screen.getByLabelText("Bis")).toHaveValue("");
  });

  it("shows the month when from/to span exactly one month, otherwise a custom range", async () => {
    setup("?from=2026-10-01&to=2026-10-31");
    await loaded();
    expect(screen.getByLabelText("Monat")).toHaveValue("2026-10");
  });

  it("shows a custom range for any other from/to", async () => {
    setup("?from=2026-10-02&to=2026-10-31");
    await loaded();
    const picker = screen.getByLabelText("Monat") as HTMLSelectElement;
    expect(picker.value).toBe("custom");
    expect(picker.selectedOptions[0]?.textContent).toBe("Eigener Zeitraum");
  });
});

describe("transaction list: search", () => {
  it("finds an amount typed the German way and does not match account ids", async () => {
    const user = userEvent.setup();
    setup();
    await loaded();

    const search = screen.getByRole("searchbox");
    await user.type(search, "25,00");
    await waitFor(() => expect(listedDescriptions()).toEqual(["Letzter Oktober"]));

    await user.clear(search);
    await user.type(search, "3.000,00");
    await waitFor(() => expect(listedDescriptions()).toEqual(["Gehalt Oktober"]));

    // Every row belongs to account "acc-1": a query for it must not list them all.
    await user.clear(search);
    await user.type(search, "acc");
    await waitFor(() => expect(listedDescriptions()).toEqual([]));
  });
});

describe("transaction list: amounts in the UI's number format", () => {
  const row = (description: string) => screen.getByText(description).closest("li") as HTMLElement;

  it("prints the rows like every other screen: 3.000,00 € instead of 3000.00 €", async () => {
    setup();
    await loaded();

    expect(within(row("Gehalt Oktober")).getByText("3.000,00 €")).toBeInTheDocument();
    expect(within(row("Erster November")).getByText("-99,99 €")).toBeInTheDocument();
    expect(within(row("Sparrate")).getByText("-200,00 €")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d\.\d{2} €/);
  });

  it("prints the standing-order sums in the same format", async () => {
    recurringResponse = RECURRING;
    const user = userEvent.setup();
    setup();
    await loaded();

    // "This month": rent −950,00 + salary +3.000,00, whatever the current month is.
    const summary = (await screen.findByText("Wiederkehrende Transaktionen (diesen Monat)")).closest("summary")!;
    expect(summary).toHaveTextContent("2.050,00 €");
    expect(
      within(summary).getByRole("button", { name: "Erklärung: Daueraufträge in diesem Monat" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Wiederkehrend" }));
    const panel = document.getElementById("tab-panel-recurring")!;
    expect(within(panel).getByText("-950,00 €")).toBeInTheDocument();
    expect(within(panel).getByText("3.000,00 €")).toBeInTheDocument();
    expect(within(panel).getByText("2.050,00 €")).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/\d\.\d{2} €/);
  });
});

describe("transaction list: bookings of a standing order", () => {
  const row = (description: string) => screen.getByText(description).closest("li") as HTMLElement;

  it("marks a booking that belongs to a standing order, and only that", async () => {
    setup();
    await loaded();

    const marked = within(row("Gehalt Oktober"));
    expect(marked.getByText("Dauerauftrag")).toBeInTheDocument();
    // Screen readers get the full wording.
    expect(marked.getByText("Buchung eines Dauerauftrags")).toBeInTheDocument();
    expect(marked.getByTitle("Buchung eines Dauerauftrags")).toBeInTheDocument();

    expect(within(row("Sparrate")).queryByText("Dauerauftrag")).not.toBeInTheDocument();
    expect(screen.getAllByText("Dauerauftrag")).toHaveLength(1);
  });
});

describe("transaction list: explanations", () => {
  it("explains the totals above the list", async () => {
    setup();
    await loaded();
    expect(screen.getByRole("button", { name: "Erklärung: Summen über der Liste" })).toBeInTheDocument();
  });

  it("explains standing orders on the recurring tab", async () => {
    const user = userEvent.setup();
    setup();
    await loaded();
    await user.click(screen.getByRole("tab", { name: "Wiederkehrend" }));
    expect(screen.getByRole("button", { name: "Erklärung: So funktionieren Daueraufträge" })).toBeInTheDocument();
  });
});

describe("transaction list: CSV export", () => {
  /** Clicks the export button and returns the downloaded file's name and raw bytes. */
  async function exportCsv(user: ReturnType<typeof userEvent.setup>) {
    const blobs: Blob[] = [];
    const names: string[] = [];
    vi.stubGlobal("URL", Object.assign(Object.create(URL) as typeof URL, {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return "blob:export";
      },
      revokeObjectURL: () => {}
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    try {
      await user.click(screen.getByRole("button", { name: "Als CSV exportieren" }));
    } finally {
      click.mockRestore();
    }
    expect(blobs).toHaveLength(1);
    const bytes = new Uint8Array(await blobs[0].arrayBuffer());
    return { name: names[0], bytes, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) };
  }

  it("downloads exactly the rows shown, in list order, named after the month", async () => {
    const user = userEvent.setup();
    setup("?from=2026-10-01&to=2026-10-31&filter=outcome&sort=oldest");
    await loaded("Letzter Oktober");

    const file = await exportCsv(user);
    expect(file.name).toBe("buchungen-2026-10.csv");
    // UTF-8 BOM, so Excel shows umlauts.
    expect([...file.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(file.text).toBe(
      "﻿Datum;Beschreibung;Kategorie;Typ;Betrag;Dauerauftrag;Steuerrelevant\r\n" +
        // 1 Oct 00:30 in Berlin is still 30 Sep in UTC — the file uses the Berlin day.
        "2026-10-01;Erster Oktober;Lebensmittel;Ausgabe;-10,00;nein;nein\r\n" +
        "2026-10-31;Letzter Oktober;Lebensmittel;Ausgabe;-25,00;nein;nein\r\n"
    );
  });

  it("applies the text search and marks bookings of a standing order", async () => {
    const user = userEvent.setup();
    setup("?q=gehalt");
    await loaded();

    const file = await exportCsv(user);
    expect(file.name).toBe("buchungen.csv");
    expect(file.text.split("\r\n").slice(1)).toEqual([
      "2026-10-15;Gehalt Oktober;Gehalt;Einnahme;3000,00;ja;nein",
      ""
    ]);
  });
});
