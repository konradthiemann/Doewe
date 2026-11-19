import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../lib/i18n";
import { ToastProvider } from "../ui/Toast";

import {
  formatDayMonthShort,
  UpcomingRecurringList,
  type PlannedRecurring,
  type RecurringSuggestion
} from "./UpcomingRecurring";

const fetchMock = vi.fn();

const formatCurrency = (euros: number) =>
  `${euros.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const RENT: PlannedRecurring = { id: "rec-rent", description: "Miete Wohnung", amountCents: -95_000, dayOfMonth: 28 };
const POWER: PlannedRecurring = { id: "rec-power", description: "Strom", amountCents: -8_500, dayOfMonth: 15 };

// 23:30 UTC on 17 November is already 18 November in Berlin: the hint names
// the day the booking is counted on, whatever the device's time zone.
const RENT_SUGGESTION: RecurringSuggestion = {
  recurringId: "rec-rent",
  period: "2026-11",
  dueDay: "2026-11-28",
  transactionId: "tx-hand",
  transactionDescription: "Miete",
  transactionOccurredAt: "2026-11-17T23:30:00.000Z",
  amountCents: -95_000
};

const HINT = "Schon bezahlt? Am 18.11. hast du 950,00 € „Miete“ gebucht.";
const CONFIRM = "Das war dieser Dauerauftrag";
const LINKED = "Erledigt – der Dauerauftrag wird diesen Monat nicht noch einmal gebucht.";
const STALE = "Diese Buchung passt nicht mehr zum Dauerauftrag. Die Übersicht ist jetzt aktualisiert.";
const FAILED = "Das hat nicht geklappt. Bitte versuch es gleich noch einmal.";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(suggestions: RecurringSuggestion[] | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ToastProvider>
          <UpcomingRecurringList items={[POWER, RENT]} suggestions={suggestions} formatCurrency={formatCurrency} />
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
  // Query keys the component invalidated, in order.
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { invalidatedKeys };
}

const item = (description: string) => screen.getByText(description).closest("li") as HTMLElement;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatDayMonthShort", () => {
  it("names the Berlin calendar day", () => {
    expect(formatDayMonthShort("2026-11-17T23:30:00.000Z", "de")).toBe("18.11.");
    expect(formatDayMonthShort("2026-11-17T23:30:00.000Z", "en")).toBe("11/18");
    expect(formatDayMonthShort("2026-03-05T10:00:00.000Z", "de")).toBe("05.03.");
    expect(formatDayMonthShort("not a date", "de")).toBe("");
  });
});

describe("UpcomingRecurringList: suggestion", () => {
  it("asks only at the standing order the booking may belong to", () => {
    setup([RENT_SUGGESTION]);

    const rent = item("Miete Wohnung");
    expect(within(rent).getByText(HINT)).toBeInTheDocument();
    expect(within(rent).getByRole("button", { name: CONFIRM })).toBeEnabled();

    const power = item("Strom");
    expect(within(power).queryByText(/Schon bezahlt/)).not.toBeInTheDocument();
    expect(within(power).queryByRole("button")).not.toBeInTheDocument();
    // One button, no second choice.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows nothing for a suggestion of another standing order or without suggestions", () => {
    setup([{ ...RENT_SUGGESTION, recurringId: "rec-other" }]);
    expect(screen.queryByText(/Schon bezahlt/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("copes with a summary that has no suggestions at all", () => {
    setup(undefined);
    expect(screen.getByText("Miete Wohnung")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("leaves out the quotes when the booking has no description", () => {
    setup([{ ...RENT_SUGGESTION, transactionDescription: "  " }]);
    expect(within(item("Miete Wohnung")).getByText("Schon bezahlt? Am 18.11. hast du 950,00 € gebucht.")).toBeInTheDocument();
  });
});

describe("UpcomingRecurringList: confirming", () => {
  it("links the booking for the period, confirms and refreshes overview and bookings", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const { invalidatedKeys } = setup([RENT_SUGGESTION]);

    await user.click(screen.getByRole("button", { name: CONFIRM }));

    await waitFor(() => expect(screen.getByText(LINKED)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/recurring-transactions/rec-rent/link-booking");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ transactionId: "tx-hand", period: "2026-11" });

    expect(invalidatedKeys()).toEqual(expect.arrayContaining([["analytics"], ["transactions"]]));
    // The question is answered; the item leaves the list once the overview reloads.
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("says calmly that the booking no longer matches on 409 and refreshes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(409, { error: "Booking no longer matches" }));
    const { invalidatedKeys } = setup([RENT_SUGGESTION]);

    await user.click(screen.getByRole("button", { name: CONFIRM }));

    await waitFor(() => expect(screen.getByText(STALE)).toBeInTheDocument());
    expect(screen.queryByText(LINKED)).not.toBeInTheDocument();
    expect(invalidatedKeys()).toEqual(expect.arrayContaining([["analytics"], ["transactions"]]));
    // The server's English error text is not shown.
    expect(screen.queryByText("Booking no longer matches")).not.toBeInTheDocument();
  });

  it("keeps the question and reports a failure on other errors", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "boom" }));
    setup([RENT_SUGGESTION]);

    await user.click(screen.getByRole("button", { name: CONFIRM }));

    await waitFor(() => expect(screen.getByText(FAILED)).toBeInTheDocument());
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONFIRM })).toBeEnabled();
  });
});
