import { render, screen } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { BudgetPlanEditor, type BudgetPlanEditorProps } from "./BudgetPlanEditor";

const formatCurrency = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const available = Array.from({ length: 12 }, () => 100000);

function setup(props: Partial<BudgetPlanEditorProps> = {}) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  render(
    <I18nProvider>
      <BudgetPlanEditor
        category={{ id: "cat-1", name: "Lebensmittel" }}
        plan={null}
        availablePerMonthCents={available}
        monthLabels={monthLabels}
        formatCurrency={formatCurrency}
        onSave={onSave}
        onDelete={onDelete}
        {...props}
      />
    </I18nProvider>
  );
  return { onSave, onDelete, user: userEvent.setup() };
}

const period = () => screen.getByRole("combobox", { name: "Zeitraum" });
const amount = () => screen.getByRole("textbox", { name: "Betrag" });
const saveBtn = () => screen.getByRole("button", { name: "Speichern" });
const deleteBtn = () => screen.queryByRole("button", { name: "Entfernen" });

describe("BudgetPlanEditor", () => {
  it("shows the category name", () => {
    setup();
    expect(screen.getByText("Lebensmittel")).toBeInTheDocument();
  });

  it("offers monthly/yearly options and defaults to MONTHLY without a plan", () => {
    setup();
    const options = Array.from(period().querySelectorAll("option"));
    expect(options.map((o) => o.getAttribute("value"))).toEqual(["MONTHLY", "YEARLY"]);
    expect(screen.getByRole("option", { name: "Monatlich" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Jährlich" })).toBeInTheDocument();
    expect(period()).toHaveValue("MONTHLY");
  });

  it("has an empty decimal amount input without a plan", () => {
    setup();
    expect(amount()).toHaveValue("");
    expect(amount()).toHaveAttribute("inputmode", "decimal");
  });

  it("prefills period and amount (German format) from the plan", () => {
    setup({ plan: { id: "p1", period: "YEARLY", amountCents: 12345 } });
    expect(period()).toHaveValue("YEARLY");
    expect(amount()).toHaveValue("123,45");
  });

  it.each(["", "   ", "abc", "0", "0,00", "-5"])("disables save for invalid or non-positive amount %j", async (text) => {
    const { user, onSave } = setup();
    if (text.trim() !== "") await user.type(amount(), text);
    expect(saveBtn()).toBeDisabled();
    await user.click(saveBtn());
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([
    ["1.234,56", 123456],
    ["50", 5000],
    ["12,5", 1250]
  ])("saves %j as %i cents with the selected period", async (text, cents) => {
    const { user, onSave } = setup();
    await user.type(amount(), text);
    expect(saveBtn()).toBeEnabled();
    await user.click(saveBtn());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ period: "MONTHLY", amountCents: cents });
  });

  it("saves with YEARLY after switching the period", async () => {
    const { user, onSave } = setup();
    await user.selectOptions(period(), "YEARLY");
    await user.type(amount(), "1200");
    await user.click(saveBtn());
    expect(onSave).toHaveBeenCalledWith({ period: "YEARLY", amountCents: 120000 });
  });

  it("saves on Enter in the amount field when valid", async () => {
    const { user, onSave } = setup();
    await user.type(amount(), "20{Enter}");
    expect(onSave).toHaveBeenCalledWith({ period: "MONTHLY", amountCents: 2000 });
  });

  it("does not save on Enter when the amount is invalid", async () => {
    const { user, onSave } = setup();
    await user.type(amount(), "abc{Enter}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the delete button only with a plan and an onDelete handler, and calls onDelete", async () => {
    const { user, onDelete } = setup({ plan: { id: "p1", period: "MONTHLY", amountCents: 5000 } });
    await user.click(deleteBtn()!);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("hides the delete button without a plan", () => {
    setup({ plan: null });
    expect(deleteBtn()).not.toBeInTheDocument();
  });

  it("hides the delete button without an onDelete handler", () => {
    setup({ plan: { id: "p1", period: "MONTHLY", amountCents: 5000 }, onDelete: undefined });
    expect(deleteBtn()).not.toBeInTheDocument();
  });

  it("disables the buttons while busy", () => {
    setup({ plan: { id: "p1", period: "MONTHLY", amountCents: 5000 }, busy: true });
    expect(saveBtn()).toBeDisabled();
    expect(deleteBtn()).toBeDisabled();
  });

  it("shows the twelve-month preview only for YEARLY", async () => {
    const { user } = setup();
    expect(screen.queryByText("Feb")).not.toBeInTheDocument();
    await user.selectOptions(period(), "YEARLY");
    for (const label of monthLabels) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows the preview initially for a YEARLY plan", () => {
    setup({ plan: { id: "p1", period: "YEARLY", amountCents: 120000 } });
    expect(screen.getByText("Feb")).toBeInTheDocument();
  });

  it("uses the currently typed, unsaved amount for the preview", async () => {
    const { user } = setup({ plan: { id: "p1", period: "YEARLY", amountCents: 120000 } });
    // plan: 1200,00 over 12 equal months -> 100,00 each
    expect(screen.getAllByText("EUR 100.00")).toHaveLength(12);
    await user.clear(amount());
    await user.type(amount(), "2400");
    expect(screen.getAllByText("EUR 200.00")).toHaveLength(12);
    expect(screen.queryByText("EUR 100.00")).not.toBeInTheDocument();
  });
});
