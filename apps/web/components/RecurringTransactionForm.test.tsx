import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../lib/i18n";

import RecurringTransactionForm from "./RecurringTransactionForm";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A standing order that started in March; "today" is 19 November 2026. */
const RENT = {
  id: "rec-1",
  accountId: "acc-1",
  amountCents: -95_000,
  description: "Miete",
  categoryId: "cat-home",
  intervalMonths: 1,
  dayOfMonth: 1,
  startDate: "2026-03-01"
};

function setup(recurring = RENT) {
  const onSuccess = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RecurringTransactionForm recurring={recurring} onSuccess={onSuccess} />
      </I18nProvider>
    </QueryClientProvider>
  );
  return { onSuccess };
}

/** Body of the PATCH that saved the standing order. */
function savedBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
  if (!call) throw new Error("no PATCH request was sent");
  return JSON.parse((call[1] as RequestInit).body as string);
}
const patchSent = () => fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");

const startDateField = () => screen.getByLabelText("Startdatum (optional)") as HTMLInputElement;
const dayField = () => screen.getByLabelText(/Tag des Monats/) as HTMLInputElement;
const backfillBox = () => screen.queryByRole("checkbox", { name: "Vergangene Monate nachbuchen" }) as HTMLInputElement | null;

async function save(user: ReturnType<typeof userEvent.setup>, onSuccess: ReturnType<typeof vi.fn>) {
  await user.click(screen.getByRole("button", { name: "Speichern" }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-19T10:00:00.000Z") });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PATCH") return jsonResponse(200, { id: "rec-1" });
    if (url.startsWith("/api/accounts")) return jsonResponse(200, [{ id: "acc-1", name: "Hauptkonto" }]);
    if (url.startsWith("/api/categories")) {
      return jsonResponse(200, [{ id: "cat-home", name: "Wohnen", isIncome: false }]);
    }
    return jsonResponse(404, { error: `unexpected request ${url}` });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RecurringTransactionForm (edit): day and start date stay as stored", () => {
  it("does not send day, start date or backfill when neither was changed", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();

    // The stored start date lies in the past — that alone does not raise the question.
    expect(startDateField().value).toBe("2026-03-01");
    expect(backfillBox()).toBeNull();

    const description = screen.getByLabelText(/Beschreibung/);
    await user.clear(description);
    await user.type(description, "Miete Wohnung");
    await save(user, onSuccess);

    const body = savedBody();
    expect(body).toMatchObject({ description: "Miete Wohnung", amountCents: -95_000, intervalMonths: 1 });
    expect(body).not.toHaveProperty("startDate");
    expect(body).not.toHaveProperty("dayOfMonth");
    expect(body).not.toHaveProperty("backfill");
  });

  it("sends only the day when the day is changed, and shows the start date on that day", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();

    fireEvent.change(dayField(), { target: { value: "20" } });
    expect(startDateField().value).toBe("2026-03-20");
    // The series is not re-anchored, so nothing about past months is asked.
    expect(backfillBox()).toBeNull();

    await save(user, onSuccess);
    const body = savedBody();
    expect(body.dayOfMonth).toBe(20);
    expect(body).not.toHaveProperty("startDate");
    expect(body).not.toHaveProperty("backfill");
  });
});

describe("RecurringTransactionForm (edit): a new start date", () => {
  it("sets the day to the start date's day", () => {
    setup();
    fireEvent.change(startDateField(), { target: { value: "2026-12-15" } });
    expect(dayField().value).toBe("15");
  });

  it("offers to book past months for a start date in a past month — off by default", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();

    fireEvent.change(startDateField(), { target: { value: "2026-08-15" } });

    expect(backfillBox()).not.toBeNull();
    expect(backfillBox()!.checked).toBe(false);
    // August, September, October.
    expect(screen.getByText(/Mit Haken werden 3 Buchungen für die Vergangenheit angelegt/)).toBeInTheDocument();

    await save(user, onSuccess);
    expect(savedBody()).toMatchObject({ startDate: "2026-08-15", dayOfMonth: 15, backfill: false });
  });

  it("sends backfill: true when the box is ticked", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();

    fireEvent.change(startDateField(), { target: { value: "2026-10-05" } });
    expect(screen.getByText(/Mit Haken wird 1 Buchung für die Vergangenheit angelegt/)).toBeInTheDocument();
    await user.click(backfillBox()!);

    await save(user, onSuccess);
    expect(savedBody()).toMatchObject({ startDate: "2026-10-05", dayOfMonth: 5, backfill: true });
  });

  it("does not ask for a start date in the current month or later", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();

    fireEvent.change(startDateField(), { target: { value: "2026-11-02" } }); // this month, day already passed
    expect(backfillBox()).toBeNull();
    fireEvent.change(startDateField(), { target: { value: "2027-02-10" } });
    expect(backfillBox()).toBeNull();

    await save(user, onSuccess);
    const body = savedBody();
    expect(body).toMatchObject({ startDate: "2027-02-10", dayOfMonth: 10 });
    expect(body).not.toHaveProperty("backfill");
  });

  it("forgets a ticked box when the start date moves out of the past", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();

    fireEvent.change(startDateField(), { target: { value: "2026-08-15" } });
    await user.click(backfillBox()!);
    fireEvent.change(startDateField(), { target: { value: "2026-12-01" } });
    expect(backfillBox()).toBeNull();
    fireEvent.change(startDateField(), { target: { value: "2026-09-01" } });
    expect(backfillBox()!.checked).toBe(false);

    await save(user, onSuccess);
    expect(savedBody()).toMatchObject({ startDate: "2026-09-01", backfill: false });
  });

  it("counts by the Berlin month just after midnight on the 1st", () => {
    // 1 Nov 2026, 00:30 in Berlin — still 31 Oct in UTC and in Los Angeles.
    vi.setSystemTime(new Date("2026-10-31T23:30:00.000Z"));
    setup();

    fireEvent.change(startDateField(), { target: { value: "2026-10-15" } });
    expect(backfillBox()).not.toBeNull();
    expect(screen.getByText(/Mit Haken wird 1 Buchung für die Vergangenheit angelegt/)).toBeInTheDocument();
  });

  it("rejects a start date more than 10 years away at the field instead of sending it", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();

    const message = "Das Startdatum darf höchstens 10 Jahre zurück oder voraus liegen.";

    fireEvent.change(startDateField(), { target: { value: "2010-01-01" } });
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(startDateField()).toHaveAttribute("aria-invalid", "true");
    // Nothing is asked about past months for a date that cannot be saved.
    expect(backfillBox()).toBeNull();

    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Speichern" })).toBeEnabled());
    expect(patchSent()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();

    fireEvent.change(startDateField(), { target: { value: "2016-11-19" } }); // the first allowed day
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    await save(user, onSuccess);
    expect(savedBody().startDate).toBe("2016-11-19");
  });

  it("does not check a stored start date the user did not touch", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup({ ...RENT, startDate: "2010-01-01" });

    expect(screen.queryByText(/höchstens 10 Jahre/)).not.toBeInTheDocument();
    await save(user, onSuccess);
    expect(savedBody()).not.toHaveProperty("startDate");
  });
});

describe("RecurringTransactionForm: explanations", () => {
  it("has info buttons for standing orders and for the start date", () => {
    setup();
    expect(screen.getByRole("button", { name: "Erklärung: So funktionieren Daueraufträge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erklärung: Startdatum" })).toBeInTheDocument();
  });
});
