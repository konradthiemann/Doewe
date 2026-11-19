import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../lib/i18n";

import OnboardingWizard from "./OnboardingWizard";
import { ToastProvider } from "./ui/Toast";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup() {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ToastProvider>
          <OnboardingWizard open onOpenChange={onOpenChange} />
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
  return { onOpenChange };
}

/** Bodies of the POSTs sent to `url`. */
function posted(url: string): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([input, init]) => String(input) === url && (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

async function runWizard() {
  const user = userEvent.setup();
  const { onOpenChange } = setup();
  // The account the items are created on has to be loaded before "Fertig".
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/accounts", expect.anything()));

  // Each step moves the focus to its first field after a short delay. Wait for
  // that before typing, otherwise the focus jump lands in the middle of a word.
  const firstField = async (label: string | RegExp) => {
    const field = await screen.findByLabelText(label);
    await waitFor(() => expect(field).toHaveFocus());
    return field;
  };

  await user.type(await firstField(/Monatliches Einkommen/), "3200");
  await user.click(screen.getByRole("button", { name: "Weiter" }));
  await user.type(await firstField("Bezeichnung"), "Miete");
  await user.type(screen.getByLabelText("Betrag (€)"), "950,50");
  await user.click(screen.getByRole("button", { name: "Weiter" }));
  await user.type(await firstField("Wofür sparst du?"), "Urlaub");
  await user.type(screen.getByLabelText("Zielbetrag (€)"), "1200");
  await user.click(screen.getByRole("button", { name: "Fertig" }));

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") return jsonResponse(201, { id: "created" });
    if (url.startsWith("/api/accounts")) return jsonResponse(200, [{ id: "acc-1", name: "Hauptkonto" }]);
    return jsonResponse(404, {});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OnboardingWizard", () => {
  it("starts the standing orders on the 1st of the current month, so the dashboard fills immediately", async () => {
    // 19 Nov 2026, 11:00 in Berlin.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-19T10:00:00.000Z") });
    await runWizard();

    expect(posted("/api/recurring-transactions")).toEqual([
      {
        accountId: "acc-1",
        amountCents: 320000,
        description: "Monatliches Einkommen",
        intervalMonths: 1,
        dayOfMonth: 1,
        startDate: "2026-11-01"
      },
      {
        accountId: "acc-1",
        amountCents: -95050,
        description: "Miete",
        intervalMonths: 1,
        dayOfMonth: 1,
        startDate: "2026-11-01"
      }
    ]);
    expect(posted("/api/saving-plan")).toEqual([
      { accountId: "acc-1", title: "Urlaub", targetMonth: 12, targetYear: 2026, amountCents: 120000 }
    ]);
  });

  it("takes the current and the next month from the Berlin calendar, not from UTC or the device", async () => {
    // 1 Jan 2027, 00:30 in Berlin — still 31 Dec 2026 in UTC and in Los Angeles.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-12-31T23:30:00.000Z") });
    await runWizard();

    const recurring = posted("/api/recurring-transactions");
    expect(recurring).toHaveLength(2);
    expect(recurring.every((body) => body.startDate === "2027-01-01")).toBe(true);
    expect(posted("/api/saving-plan")[0]).toMatchObject({ targetMonth: 2, targetYear: 2027 });
  });
});
