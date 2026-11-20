import { render, screen, waitFor } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../lib/i18n";

import { CompleteGoalDialog, type CompletableGoal } from "./CompleteGoalDialog";

// Completing a goal books nothing: the dialog shows what was spent on the
// goal and lets the user add a last payment from savings.

const fetchMock = vi.fn();

/** 19 Nov 2026, 00:30 in Berlin — still the 18th in UTC. */
const NOW = new Date("2026-11-18T23:30:00.000Z");

const GOAL: CompletableGoal = {
  id: "goal-1",
  title: "Urlaub",
  amountCents: 200_000,
  transactionSpentCents: 30_000,
  savingsPaidCents: 150_000
};

const formatCurrency = (cents: number) =>
  `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function setup(goal: CompletableGoal = GOAL) {
  const onCompleted = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <CompleteGoalDialog goal={goal} formatCurrency={formatCurrency} onClose={onClose} onCompleted={onCompleted} />
    </I18nProvider>
  );
  return { onCompleted, onClose };
}

function completeBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([input, init]) =>
      String(input) === "/api/saving-plan/goal-1/complete" && (init as RequestInit | undefined)?.method === "POST"
  );
  if (!call) throw new Error("no complete request was sent");
  return JSON.parse((call[1] as RequestInit).body as string);
}

const restField = () => screen.getByLabelText("Noch aus Erspartem bezahlt") as HTMLInputElement;
const total = () => screen.getByTestId("complete-goal-total");
const confirmButton = () => screen.getByRole("button", { name: "Ziel abschließen" });
const posted = () => fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: "goal-1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CompleteGoalDialog", () => {
  it("shows both sources and their total, and books nothing without a last payment", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();

    expect(screen.getByText("Aus dem Monatsbudget (verknüpfte Buchungen)")).toBeInTheDocument();
    expect(screen.getByText("300,00 €")).toBeInTheDocument();
    expect(screen.getByText("1.500,00 €")).toBeInTheDocument();
    expect(total()).toHaveTextContent("1.800,00 €");
    expect(screen.getByText("2.000,00 €")).toBeInTheDocument();

    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(completeBody()).toEqual({ savingsPayment: null });
  });

  it("adds a last payment from savings, dated today in Berlin", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();

    await user.type(restField(), "199,90");
    expect(total()).toHaveTextContent("1.999,90 €");

    await user.click(confirmButton());
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(completeBody()).toEqual({ savingsPayment: { amountCents: 19_990, day: "2026-11-19" } });
  });

  it("does not send anything for an unusable amount", async () => {
    const user = userEvent.setup();
    const { onCompleted } = setup();

    await user.type(restField(), "abc");
    await user.click(confirmButton());

    expect(
      await screen.findByText("Bitte einen Betrag eingeben, zum Beispiel 200 oder 199,90 – oder das Feld leer lassen.")
    ).toBeInTheDocument();
    expect(posted()).toBe(false);
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("leaves out the target for a goal without one", () => {
    setup({ ...GOAL, amountCents: null });
    expect(screen.queryByText("Zielbetrag")).not.toBeInTheDocument();
  });

  it("says so when the server refuses", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "x" }), { status: 409 }));
    const user = userEvent.setup();
    const { onCompleted } = setup();

    await user.click(confirmButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Sparziel konnte nicht abgeschlossen werden.");
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
