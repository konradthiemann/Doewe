import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { CategoryBreakdown, type ReviewCategory } from "./CategoryBreakdown";

const formatCurrency = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;

function cat(overrides: Partial<ReviewCategory> & Pick<ReviewCategory, "id" | "name">): ReviewCategory {
  return { spentCents: 0, budgetCents: null, transactionCount: 0, transactions: [], ...overrides };
}

function setup(categories: ReviewCategory[], outcomeCents = 10000) {
  return render(
    <I18nProvider>
      <CategoryBreakdown
        categories={categories}
        outcomeCents={outcomeCents}
        formatCurrency={formatCurrency}
        dateLocale="de-DE"
      />
    </I18nProvider>
  );
}

const food = cat({
  id: "c-food",
  name: "Food",
  spentCents: 6000,
  transactionCount: 2,
  transactions: [
    { id: "t1", description: "Supermarket", amountCents: 4000, occurredAt: "2025-03-10T12:00:00.000Z" },
    { id: "t2", description: "Bakery", amountCents: 2000, occurredAt: "2025-03-05T12:00:00.000Z" }
  ]
});
const fun = cat({ id: "c-fun", name: "Fun", spentCents: 4000, transactionCount: 0 });

describe("CategoryBreakdown", () => {
  it("renders each category as a collapsed toggle button with aria-controls", () => {
    setup([food, fun]);
    const btn = screen.getByRole("button", { name: /Food/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAttribute("aria-controls");
    expect(screen.queryByText("Supermarket")).not.toBeInTheDocument();
  });

  it("expands on click showing description, amount and date in the given order, collapses on second click", async () => {
    const user = userEvent.setup();
    setup([food, fun]);
    const btn = screen.getByRole("button", { name: /Food/ });

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(btn.getAttribute("aria-controls")!);
    expect(panel).not.toBeNull();
    const text = panel!.textContent ?? "";
    expect(within(panel!).getByText("Supermarket")).toBeInTheDocument();
    expect(within(panel!).getByText("Bakery")).toBeInTheDocument();
    expect(text.indexOf("Supermarket")).toBeLessThan(text.indexOf("Bakery"));
    expect(text).toContain(formatCurrency(4000));
    expect(text).toContain(formatCurrency(2000));
    expect(text).toMatch(/10\.\s?(03\.|3\.|März)/);

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Supermarket")).not.toBeInTheDocument();
  });

  it("shows a share progressbar with percent text for categories without budget (60/40)", () => {
    setup([food, fun], 10000);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    const values = bars.map((b) => b.getAttribute("aria-valuenow"));
    expect(values).toEqual(["60", "40"]);
    expect(screen.getByText(/60\s?%/)).toBeInTheDocument();
    expect(screen.getByText(/40\s?%/)).toBeInTheDocument();
  });

  it("shows 'über Budget' text and caps the progressbar at 100 when over budget", () => {
    setup([cat({ id: "c-over", name: "Rent", spentCents: 13000, budgetCents: 10000, transactionCount: 1 })], 13000);
    expect(screen.getByText(new RegExp(`${formatCurrency(3000).replace(".", "\\.")} über Budget`))).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows the 'Ohne Kategorie' label for the uncategorized entry (i18n key review.uncategorized)", () => {
    setup([cat({ id: "uncategorized", name: "Uncategorized", spentCents: 400, transactionCount: 1 })], 400);
    expect(screen.getByRole("button", { name: /Ohne Kategorie/ })).toBeInTheDocument();
    expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();
  });

  it("shows an empty hint when expanding a category without transactions", async () => {
    const user = userEvent.setup();
    setup([fun]);
    expect(screen.queryByTestId("category-transactions-empty")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Fun/ }));
    expect(screen.getByTestId("category-transactions-empty")).toBeInTheDocument();
  });
});
