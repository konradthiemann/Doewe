import { render, screen, waitFor } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../lib/i18n";

import { MakeRecurringSection } from "./MakeRecurringSection";

const fetchMock = vi.fn();

function setup(props: Partial<React.ComponentProps<typeof MakeRecurringSection>> = {}) {
  const onMade = vi.fn();
  render(
    <I18nProvider>
      <MakeRecurringSection transactionId="tx-1" bookingDay={17} onMade={onMade} {...props} />
    </I18nProvider>
  );
  return { onMade };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sentBody(): { intervalMonths: unknown; dayOfMonth: unknown } {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

const BUTTON_NAME = "Als wiederkehrend festlegen";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MakeRecurringSection", () => {
  it("shows only a hint (no form, no button) when already linked", () => {
    setup({ recurringTransactionId: "rec-1" });
    expect(screen.queryByRole("button", { name: BUTTON_NAME })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    // Hint text comes from i18n key transactionForm.makeRecurringAlreadyLinked.
    expect(screen.getByText(/\S/)).toBeInTheDocument();
  });

  it("renders interval select with 1, 3, 6, 12 months and a custom option, plus a day input defaulting to bookingDay", () => {
    setup();
    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option"));
    expect(options).toHaveLength(5);
    expect(options.slice(0, 4).map((o) => o.getAttribute("value"))).toEqual(["1", "3", "6", "12"]);
    expect(screen.getByRole("spinbutton")).toHaveValue(17);
    expect(screen.getByRole("button", { name: BUTTON_NAME })).toBeEnabled();
  });

  it("reveals a 1-24 number input for the custom interval", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);

    await user.selectOptions(screen.getByRole("combobox"), screen.getAllByRole("option")[4]);

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);
    const custom = inputs.find((i) => i.getAttribute("max") === "24");
    expect(custom).toBeDefined();
    expect(custom).toHaveAttribute("min", "1");
  });

  it("posts intervalMonths and dayOfMonth as numbers and calls onMade on 201", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "rec-1" }));
    const { onMade } = setup();

    await user.selectOptions(screen.getByRole("combobox"), "3");
    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(onMade).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/transactions/tx-1/make-recurring");
    expect(init.method).toBe("POST");
    expect(sentBody()).toEqual({ intervalMonths: 3, dayOfMonth: 17 });
    expect(typeof onMade.mock.calls[0][0]).toBe("string");
    expect(onMade.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it("sends the edited day and the custom interval", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "rec-1" }));
    const { onMade } = setup();

    await user.selectOptions(screen.getByRole("combobox"), screen.getAllByRole("option")[4]);
    const [dayInput, customInput] = screen.getAllByRole("spinbutton");
    // DOM order is not specified: identify the custom input by its max attribute.
    const custom = [dayInput, customInput].find((i) => i.getAttribute("max") === "24")!;
    const day = [dayInput, customInput].find((i) => i !== custom)!;
    await user.clear(custom);
    await user.type(custom, "5");
    await user.clear(day);
    await user.type(day, "28");
    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));

    await waitFor(() => expect(onMade).toHaveBeenCalled());
    expect(sentBody()).toEqual({ intervalMonths: 5, dayOfMonth: 28 });
  });

  it("shows an alert on 409 and does not call onMade", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: "Transaction is already linked to a recurring transaction" })
    );
    const { onMade } = setup();

    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onMade).not.toHaveBeenCalled();
  });

  it("shows a generic alert on other errors (500 and network failure)", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }));
    const { onMade } = setup();

    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));
    const first = await screen.findByRole("alert");
    expect(first).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onMade).not.toHaveBeenCalled();
  });

  it("disables the button while the request is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    setup();

    await user.click(screen.getByRole("button", { name: BUTTON_NAME }));
    await waitFor(() => expect(screen.getByRole("button", { name: /.+/ })).toBeDisabled());

    resolve(jsonResponse(201, { id: "rec-1" }));
  });
});
