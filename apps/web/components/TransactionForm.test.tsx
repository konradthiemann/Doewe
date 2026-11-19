import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../lib/i18n";

// Server action (pulls in Prisma/auth) and the IndexedDB outbox are not part of these tests.
vi.mock("../app/actions/categories", () => ({ createCategoryAction: vi.fn() }));
vi.mock("../lib/offline/queueOfflineTransaction", () => ({ queueOfflineTransaction: vi.fn() }));

const { default: TransactionForm } = await import("./TransactionForm");

const fetchMock = vi.fn();

const CATEGORIES = [
  { id: "cat-food", name: "Lebensmittel", isIncome: false },
  { id: "cat-salary", name: "Gehalt", isIncome: true },
  { id: "cat-savings", name: "Savings", isIncome: false }
];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Tx = React.ComponentProps<typeof TransactionForm>["transaction"];

function setup(transaction: NonNullable<Tx>) {
  const onSuccess = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TransactionForm mode="edit" transaction={transaction} onSuccess={onSuccess} />
      </I18nProvider>
    </QueryClientProvider>
  );
  return { onSuccess };
}

/** Body of the PATCH that saved the booking. */
function savedBody(): { categoryId?: string; amountCents: number; description: string; occurredAt: string } {
  const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
  if (!call) throw new Error("no PATCH request was sent");
  return JSON.parse((call[1] as RequestInit).body as string);
}

function categoryTrigger(): HTMLElement {
  const trigger = document.getElementById("tx-category");
  if (!trigger) throw new Error("category select not rendered");
  return trigger;
}

async function editDescriptionAndSave(user: ReturnType<typeof userEvent.setup>, text: string) {
  const description = screen.getByLabelText(/Beschreibung/);
  await user.clear(description);
  await user.type(description, text);
  await user.click(screen.getByRole("button", { name: "Speichern" }));
}

/** A savings withdrawal: positive amount in the savings category (classified as savings, not income). */
const WITHDRAWAL = {
  id: "tx-1",
  accountId: "acc-1",
  amountCents: 5000,
  description: "Entnahme Urlaub",
  occurredAt: "2026-11-10T11:00:00.000Z",
  categoryId: "cat-savings",
  recurringTransactionId: "rec-1"
};

/** A correction: negative amount in an income category (an outcome by its sign). */
const CORRECTION = {
  id: "tx-2",
  accountId: "acc-1",
  amountCents: -2500,
  description: "Korrektur Gehalt",
  occurredAt: "2026-11-10T11:00:00.000Z",
  categoryId: "cat-salary",
  recurringTransactionId: "rec-1"
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PATCH") return jsonResponse(200, { id: "tx" });
    if (url.startsWith("/api/accounts")) return jsonResponse(200, [{ id: "acc-1", name: "Hauptkonto" }]);
    if (url.startsWith("/api/categories")) return jsonResponse(200, CATEGORIES);
    return jsonResponse(404, { error: `unexpected request ${url}` });
  });
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no layout: the category dropdown scrolls its highlighted option into view.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TransactionForm (edit): the stored category survives an unrelated edit", () => {
  it("keeps a savings withdrawal in the savings category although the type toggle shows income", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup(WITHDRAWAL);

    // Categories are loaded and the stored category is shown, although it is not an income category.
    await waitFor(() => expect(categoryTrigger()).toHaveTextContent("Savings"));
    expect(screen.getByRole("button", { name: "Einnahme" })).toHaveAttribute("aria-pressed", "true");

    await editDescriptionAndSave(user, "Entnahme Sommerurlaub");

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const body = savedBody();
    expect(body.categoryId).toBe("cat-savings");
    expect(body.amountCents).toBe(5000);
    expect(body.description).toBe("Entnahme Sommerurlaub");
    // Unchanged day → the exact timestamp is preserved.
    expect(body.occurredAt).toBe(WITHDRAWAL.occurredAt);
    expect(categoryTrigger()).toHaveTextContent("Savings");
  });

  it("keeps a negative correction in its income category although the type toggle shows outcome", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup(CORRECTION);

    await waitFor(() => expect(categoryTrigger()).toHaveTextContent("Gehalt"));
    expect(screen.getByRole("button", { name: "Ausgabe" })).toHaveAttribute("aria-pressed", "true");

    await editDescriptionAndSave(user, "Korrektur Gehalt Oktober");

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const body = savedBody();
    expect(body.categoryId).toBe("cat-salary");
    expect(body.amountCents).toBe(-2500);
  });

  it("offers the stored category in the list next to the categories of the shown type", async () => {
    const user = userEvent.setup();
    setup(WITHDRAWAL);
    await waitFor(() => expect(categoryTrigger()).toHaveTextContent("Savings"));

    await user.click(categoryTrigger());
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    const labels = options.map((option) => option.textContent ?? "");
    expect(labels.some((label) => label.includes("Gehalt"))).toBe(true);
    expect(labels.some((label) => label.includes("Savings"))).toBe(true);
    expect(labels.some((label) => label.includes("Lebensmittel"))).toBe(false);
  });

  it("changes the category when the user switches the type", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup(WITHDRAWAL);
    await waitFor(() => expect(categoryTrigger()).toHaveTextContent("Savings"));

    await user.click(screen.getByRole("button", { name: "Ausgabe" }));
    // The toggle picks the first category of that kind itself.
    await waitFor(() => expect(categoryTrigger()).toHaveTextContent("Lebensmittel"));

    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(savedBody()).toMatchObject({ categoryId: "cat-food", amountCents: -5000 });
  });

  it("changes the category when the user picks another one", async () => {
    const user = userEvent.setup();
    const { onSuccess } = setup(WITHDRAWAL);
    await waitFor(() => expect(categoryTrigger()).toHaveTextContent("Savings"));

    await user.click(categoryTrigger());
    await user.click(within(screen.getByRole("listbox")).getByText("Gehalt"));
    await waitFor(() => expect(categoryTrigger()).toHaveTextContent("Gehalt"));

    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(savedBody()).toMatchObject({ categoryId: "cat-salary", amountCents: 5000 });
  });
});
