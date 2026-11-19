import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../lib/i18n";

import { CompleteGoalDialog, withdrawableCents, type CompletableGoal } from "./CompleteGoalDialog";

const fetchMock = vi.fn();

const CATEGORIES = [
  { id: "cat-home", name: "Haushalt", isIncome: false },
  { id: "cat-food", name: "Lebensmittel", isIncome: false },
  { id: "cat-salary", name: "Gehalt", isIncome: true },
  { id: "cat-savings", name: "Sparen", isIncome: false },
  { id: "cat-savings-en", name: " savings ", isIncome: false }
];

const GOAL: CompletableGoal = { id: "goal-1", title: "Waschmaschine", amountCents: 30_000, transactionSpentCents: 0 };

const formatCurrency = (cents: number) =>
  `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(goal: CompletableGoal = GOAL, poolCents = 125_000) {
  const onCompleted = vi.fn();
  const onClose = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <CompleteGoalDialog
          goal={goal}
          poolCents={poolCents}
          formatCurrency={formatCurrency}
          onClose={onClose}
          onCompleted={onCompleted}
        />
      </I18nProvider>
    </QueryClientProvider>
  );
  return { onCompleted, onClose };
}

/** Body of the request that completed the goal. */
function completeBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([input, init]) =>
      String(input) === "/api/saving-plan/goal-1/complete" && (init as RequestInit | undefined)?.method === "POST"
  );
  if (!call) throw new Error("no complete request was sent");
  return JSON.parse((call[1] as RequestInit).body as string);
}

const costField = () => screen.getByLabelText("Was hat es gekostet?") as HTMLInputElement;
const withdrawSwitch = () => screen.getByRole("checkbox", { name: "Aus dem Spartopf nehmen" }) as HTMLInputElement;
const expenseSwitch = () => screen.getByRole("checkbox", { name: "Kauf als Ausgabe buchen" }) as HTMLInputElement;
const categorySelect = () => screen.getByLabelText("Kategorie der Ausgabe") as HTMLSelectElement;
const summary = () => screen.getByTestId("complete-goal-summary");
const confirmButton = () => screen.getByRole("button", { name: "Ziel abschließen" });
/** The categories arrive asynchronously. */
const categoriesLoaded = () => waitFor(() => expect(within(categorySelect()).getByText("Haushalt")).toBeInTheDocument());

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      return jsonResponse(200, { id: "goal-1", withdrawnCents: 30_000, expenseTransactionId: "tx-9" });
    }
    if (url.startsWith("/api/categories")) return jsonResponse(200, CATEGORIES);
    return jsonResponse(404, { error: `unexpected request ${url}` });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withdrawableCents", () => {
  it("is the cost, but never more than the pool holds", () => {
    expect(withdrawableCents(30_000, 125_000)).toBe(30_000);
    expect(withdrawableCents(30_000, 20_000)).toBe(20_000);
    expect(withdrawableCents(30_000, 0)).toBe(0);
    expect(withdrawableCents(0, 125_000)).toBe(0);
  });
});

describe("CompleteGoalDialog: defaults", () => {
  it("prefills the cost with the goal's target and switches both choices on", async () => {
    setup();
    await categoriesLoaded();

    expect(screen.getByRole("dialog", { name: "Ziel abschließen" })).toBeInTheDocument();
    expect(costField().value).toBe("300,00");
    expect(withdrawSwitch().checked).toBe(true);
    expect(expenseSwitch().checked).toBe(true);
    expect(screen.getByText("Im Spartopf: 1.250,00 €")).toBeInTheDocument();
  });

  it("offers expense categories only — no income and no savings category", async () => {
    setup();
    await categoriesLoaded();

    const options = within(categorySelect())
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Ohne Kategorie", "Haushalt", "Lebensmittel"]);
  });

  it("takes the money out of the pool and books the purchase in the chosen category", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();
    await categoriesLoaded();

    await user.selectOptions(categorySelect(), "cat-home");
    expect(summary()).toHaveTextContent(
      "300,00 € werden aus dem Spartopf genommen und als Ausgabe in „Haushalt“ gebucht."
    );

    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));

    expect(completeBody()).toEqual({ spentCents: 30_000, withdraw: true, expense: { categoryId: "cat-home" } });
    expect(onCompleted).toHaveBeenCalledWith({ withdrawnCents: 30_000, expenseTransactionId: "tx-9" });
  });

  it("books the purchase without a category when none is chosen", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();
    await categoriesLoaded();

    expect(summary()).toHaveTextContent(
      "300,00 € werden aus dem Spartopf genommen und als Ausgabe ohne Kategorie gebucht."
    );
    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));

    expect(completeBody()).toEqual({ spentCents: 30_000, withdraw: true, expense: { categoryId: null } });
  });
});

describe("CompleteGoalDialog: the three choices", () => {
  it("sends the cost the user entered", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();
    await categoriesLoaded();

    await user.clear(costField());
    await user.type(costField(), "279,90");
    expect(summary()).toHaveTextContent("279,90 € werden aus dem Spartopf genommen und als Ausgabe ohne Kategorie gebucht.");

    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(completeBody()).toMatchObject({ spentCents: 27_990, withdraw: true });
  });

  it("leaves the pool alone when the money was already taken out", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();
    await categoriesLoaded();

    await user.click(withdrawSwitch());
    expect(screen.getByText("Aus: Du hast das Geld schon selbst aus dem Spartopf genommen.")).toBeInTheDocument();
    expect(summary()).toHaveTextContent(
      "Der Spartopf bleibt unverändert. 300,00 € werden als Ausgabe ohne Kategorie gebucht."
    );

    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(completeBody()).toEqual({ spentCents: 30_000, withdraw: false, expense: { categoryId: null } });
  });

  it("books no expense when that is switched off", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();
    await categoriesLoaded();

    await user.click(expenseSwitch());
    expect(screen.queryByLabelText("Kategorie der Ausgabe")).not.toBeInTheDocument();
    expect(summary()).toHaveTextContent("300,00 € werden aus dem Spartopf genommen. Es wird keine Ausgabe gebucht.");

    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(completeBody()).toEqual({ spentCents: 30_000, withdraw: true, expense: null });
  });

  it("does not offer to book the purchase again when bookings are already linked to the goal", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup({ ...GOAL, transactionSpentCents: 29_900 });

    expect(expenseSwitch().checked).toBe(false);
    expect(
      screen.getByText("Mit diesem Ziel sind schon Buchungen über 299,00 € verknüpft – der Kauf ist also bereits gebucht.")
    ).toBeInTheDocument();
    expect(summary()).toHaveTextContent("300,00 € werden aus dem Spartopf genommen. Es wird keine Ausgabe gebucht.");

    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(completeBody()).toEqual({ spentCents: 30_000, withdraw: true, expense: null });
  });
});

describe("CompleteGoalDialog: a pool smaller than the cost", () => {
  it("says that only what is there is taken and the rest comes from the month's budget", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup(GOAL, 20_000);
    await categoriesLoaded();

    expect(
      screen.getByText(
        "Im Spartopf sind nur 200,00 €. Es wird nur genommen, was da ist – die restlichen 100,00 € kommen aus dem Budget dieses Monats."
      )
    ).toBeInTheDocument();
    expect(summary()).toHaveTextContent(
      "200,00 € werden aus dem Spartopf genommen. 300,00 € werden als Ausgabe ohne Kategorie gebucht."
    );

    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    // The server caps the withdrawal; the request states the cost and the wish.
    expect(completeBody()).toEqual({ spentCents: 30_000, withdraw: true, expense: { categoryId: null } });
  });

  it("says that nothing is taken from an empty pool", async () => {
    setup(GOAL, 0);
    await categoriesLoaded();

    expect(screen.getByText("Der Spartopf ist leer – es wird nichts herausgenommen.")).toBeInTheDocument();
    expect(summary()).toHaveTextContent("Aus dem Spartopf wird nichts genommen – er ist leer.");
  });
});

describe("CompleteGoalDialog: validation and errors", () => {
  it("does not send anything for an unusable amount", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();
    await categoriesLoaded();

    await user.clear(costField());
    await user.type(costField(), "abc");
    await user.click(confirmButton());

    expect(await screen.findByText("Bitte gib einen Betrag ein, zum Beispiel 300 oder 299,90.")).toBeInTheDocument();
    expect(screen.queryByTestId("complete-goal-summary")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("starts with an empty cost for a goal without a target", () => {
    setup({ ...GOAL, amountCents: null });
    expect(costField().value).toBe("");
  });

  it("shows an error and stays open when the server refuses", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse(500, { error: "boom" });
      return jsonResponse(200, CATEGORIES);
    });
    const user = userEvent.setup();
    const { onCompleted } = setup();
    await categoriesLoaded();

    await user.click(confirmButton());

    expect(await screen.findByText("Sparziel konnte nicht abgeschlossen werden.")).toBeInTheDocument();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("is closed while there is no goal", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <CompleteGoalDialog
            goal={null}
            poolCents={0}
            formatCurrency={formatCurrency}
            onClose={() => {}}
            onCompleted={() => {}}
          />
        </I18nProvider>
      </QueryClientProvider>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
