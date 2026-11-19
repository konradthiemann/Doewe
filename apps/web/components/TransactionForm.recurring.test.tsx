import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../lib/i18n";

// Server action (pulls in Prisma/auth) and the IndexedDB outbox are not part of these tests.
vi.mock("../app/actions/categories", () => ({ createCategoryAction: vi.fn() }));
vi.mock("../lib/offline/queueOfflineTransaction", () => ({ queueOfflineTransaction: vi.fn() }));

const { default: TransactionForm } = await import("./TransactionForm");

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup() {
  const onSuccess = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TransactionForm onSuccess={onSuccess} />
      </I18nProvider>
    </QueryClientProvider>
  );
  return { onSuccess };
}

/** Body of the POST that created the standing order. */
function createdBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([input, init]) =>
      String(input) === "/api/recurring-transactions" && (init as RequestInit | undefined)?.method === "POST"
  );
  if (!call) throw new Error("no standing order was created");
  return JSON.parse((call[1] as RequestInit).body as string);
}
const postSent = () => fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST");

const startDateField = () => screen.getByLabelText("Startdatum (optional)") as HTMLInputElement;
const dayField = () => screen.getByLabelText(/Tag des Monats/) as HTMLInputElement;
const backfillBox = () => screen.queryByRole("checkbox", { name: "Vergangene Monate nachbuchen" }) as HTMLInputElement | null;

/** Opens the form as a standing order with description and amount filled in. */
async function startStandingOrder(user: ReturnType<typeof userEvent.setup>) {
  // Account and category defaults arrive asynchronously.
  await waitFor(() => expect(document.getElementById("tx-category")).toHaveTextContent("Wohnen"));
  await user.type(screen.getByLabelText(/Beschreibung/), "Miete");
  await user.type(screen.getByLabelText(/Betrag/), "950");
  await user.click(screen.getByRole("checkbox", { name: "Wiederkehrende Buchung" }));
}

async function submit(user: ReturnType<typeof userEvent.setup>, onSuccess: ReturnType<typeof vi.fn>) {
  await user.click(screen.getByRole("button", { name: "Hinzufügen" }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  // "Today" is 19 November 2026.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-19T10:00:00.000Z") });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") return jsonResponse(201, { id: "rec-new" });
    if (url.startsWith("/api/accounts")) return jsonResponse(200, [{ id: "acc-1", name: "Hauptkonto" }]);
    if (url.startsWith("/api/categories")) {
      return jsonResponse(200, [
        { id: "cat-home", name: "Wohnen", isIncome: false },
        { id: "cat-salary", name: "Gehalt", isIncome: true }
      ]);
    }
    if (url.startsWith("/api/saving-plan")) return jsonResponse(200, { goals: [] });
    return jsonResponse(404, { error: `unexpected request ${url}` });
  });
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TransactionForm (create, standing order): day of month and start date agree", () => {
  it("sets the day to the day of the chosen start date", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();
    await startStandingOrder(user);
    expect(dayField().value).toBe("1");

    fireEvent.change(startDateField(), { target: { value: "2026-12-17" } });
    expect(dayField().value).toBe("17");

    await submit(user, onSuccess);
    expect(createdBody()).toMatchObject({
      description: "Miete",
      amountCents: -95_000,
      startDate: "2026-12-17",
      dayOfMonth: 17,
      intervalMonths: 1
    });
  });

  it("moves the start date to a day chosen afterwards, within its month", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2026-12-17" } });
    fireEvent.change(dayField(), { target: { value: "5" } });
    expect(startDateField().value).toBe("2026-12-05");

    await submit(user, onSuccess);
    expect(createdBody()).toMatchObject({ startDate: "2026-12-05", dayOfMonth: 5 });
  });

  it("clamps the start date to the length of its month", async () => {
    const user = userEvent.setup();
    setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2027-02-10" } });
    fireEvent.change(dayField(), { target: { value: "31" } });
    expect(startDateField().value).toBe("2027-02-28");
    // The day keeps what was asked for: later months have a 31st.
    expect(dayField().value).toBe("31");
  });

  it("leaves the day alone while there is no start date", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();
    await startStandingOrder(user);

    fireEvent.change(dayField(), { target: { value: "12" } });
    expect(startDateField().value).toBe("");

    await submit(user, onSuccess);
    const body = createdBody();
    expect(body.dayOfMonth).toBe(12);
    expect(body).not.toHaveProperty("startDate");
    expect(body).not.toHaveProperty("backfill");
  });
});

describe("TransactionForm (create, standing order): past months", () => {
  it("shows the box only for a start date in a month before the current one", async () => {
    const user = userEvent.setup();
    setup();
    await startStandingOrder(user);

    expect(backfillBox()).toBeNull(); // no start date
    fireEvent.change(startDateField(), { target: { value: "2026-11-02" } }); // this month, day passed
    expect(backfillBox()).toBeNull();
    fireEvent.change(startDateField(), { target: { value: "2027-01-10" } }); // later
    expect(backfillBox()).toBeNull();

    fireEvent.change(startDateField(), { target: { value: "2026-08-15" } });
    expect(backfillBox()).not.toBeNull();
    expect(backfillBox()!.checked).toBe(false);
    // August, September, October.
    expect(screen.getByText(/Mit Haken werden 3 Buchungen für die Vergangenheit angelegt/)).toBeInTheDocument();
  });

  it("counts the due months of the chosen interval", async () => {
    const user = userEvent.setup();
    setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2026-02-01" } });
    expect(screen.getByText(/Mit Haken werden 9 Buchungen/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Intervall in Monaten/), { target: { value: "3" } });
    // February, May, August.
    expect(screen.getByText(/Mit Haken werden 3 Buchungen/)).toBeInTheDocument();
  });

  it("sends backfill: false while the box is left alone", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2026-08-15" } });
    await submit(user, onSuccess);

    expect(createdBody()).toMatchObject({ startDate: "2026-08-15", dayOfMonth: 15, backfill: false });
  });

  it("sends backfill: true when the box is ticked", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2026-10-01" } });
    expect(screen.getByText(/Mit Haken wird 1 Buchung für die Vergangenheit angelegt/)).toBeInTheDocument();
    await user.click(backfillBox()!);
    await submit(user, onSuccess);

    expect(createdBody()).toMatchObject({ startDate: "2026-10-01", backfill: true });
  });

  it("sends no backfill flag for a start date in the current month or later", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2026-11-25" } });
    await submit(user, onSuccess);

    const body = createdBody();
    expect(body.startDate).toBe("2026-11-25");
    expect(body).not.toHaveProperty("backfill");
  });

  it("decides by the Berlin month just after midnight on the 1st", async () => {
    // 1 Nov 2026, 00:30 in Berlin — still 31 Oct in UTC and in Los Angeles.
    vi.setSystemTime(new Date("2026-10-31T23:30:00.000Z"));
    const user = userEvent.setup();
    setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2026-10-15" } });
    expect(backfillBox()).not.toBeNull();
    fireEvent.change(startDateField(), { target: { value: "2026-11-01" } });
    expect(backfillBox()).toBeNull();
  });
});

describe("TransactionForm (create, standing order): start date range", () => {
  it("says at the field that the start date must be within 10 years, and does not send it", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2040-01-01" } });
    expect(screen.getByText("Das Startdatum darf höchstens 10 Jahre zurück oder voraus liegen.")).toBeInTheDocument();
    expect(startDateField()).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(postSent()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();

    fireEvent.change(startDateField(), { target: { value: "2036-11-19" } }); // the last allowed day
    expect(screen.queryByText("Das Startdatum darf höchstens 10 Jahre zurück oder voraus liegen.")).not.toBeInTheDocument();
    await submit(user, onSuccess);
    expect(createdBody().startDate).toBe("2036-11-19");
  });

  it("does not ask about past months for a start date that is out of range", async () => {
    const user = userEvent.setup();
    setup();
    await startStandingOrder(user);

    fireEvent.change(startDateField(), { target: { value: "2010-01-01" } });
    expect(backfillBox()).toBeNull();
  });
});
