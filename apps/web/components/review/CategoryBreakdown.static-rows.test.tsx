import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { CategoryBreakdown, type ReviewCategory } from "./CategoryBreakdown";

const formatCurrency = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;

/** Static row: deliberately has NO `transactions` field (dashboard usage). */
function staticCat(
  overrides: Partial<ReviewCategory> & Pick<ReviewCategory, "id" | "name">
): ReviewCategory {
  return { spentCents: 0, budgetCents: null, transactionCount: 0, ...overrides };
}

function setup(categories: ReviewCategory[], outcomeCents = 100000) {
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

const groceries = staticCat({ id: "c-groc", name: "Groceries", spentCents: 11366, budgetCents: 15000 }); // 36.34 under
const rent = staticCat({ id: "c-rent", name: "Rent", spentCents: 67933, budgetCents: 60000 }); // 59.33 over
const hobby = staticCat({ id: "c-hobby", name: "Hobby", spentCents: 1999, budgetCents: 5000 });

const rowFor = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
/** Category names in DOM order (names are unique substrings of the row text). */
const order = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => ["Groceries", "Rent", "Hobby"].find((n) => li.textContent?.includes(n)));

describe("CategoryBreakdown - static rows (no transactions)", () => {
  it("renders no expandable toggle (no button[aria-expanded], no aria-controls)", () => {
    const { container } = setup([groceries, rent]);
    expect(container.querySelectorAll("button[aria-expanded]")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-controls]")).toHaveLength(0);
    expect(container.querySelectorAll("li svg")).toHaveLength(0); // no chevron
  });

  it("shows name, spent, budget, over/under status and a progressbar per row", () => {
    setup([groceries, rent]);

    const g = within(rowFor("Groceries"));
    expect(g.getByText("EUR 113.66")).toBeInTheDocument();
    expect(g.getByText(/EUR 150\.00/)).toBeInTheDocument();
    expect(g.getByText("EUR 36.34 unter Budget")).toBeInTheDocument();
    expect(g.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "76");

    const r = within(rowFor("Rent"));
    expect(r.getByText("EUR 679.33")).toBeInTheDocument();
    expect(r.getByText(/EUR 600\.00/)).toBeInTheDocument();
    expect(r.getByText("EUR 79.33 über Budget")).toBeInTheDocument();
    expect(r.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("does nothing and does not throw when the row name is clicked", async () => {
    const user = userEvent.setup();
    const { container } = setup([groceries, rent]);
    const before = container.innerHTML;

    await user.click(screen.getByText("Groceries"));

    expect(container.innerHTML).toBe(before);
    expect(container.querySelectorAll("button[aria-expanded]")).toHaveLength(0);
  });

  it("keeps the sortable column headers working (Ausgegeben -> largest first)", async () => {
    const user = userEvent.setup();
    setup([hobby, groceries, rent]);
    expect(order()).toEqual(["Hobby", "Groceries", "Rent"]);

    const spentHeader = screen.getByRole("button", { name: "Ausgegeben" });
    await user.click(spentHeader);

    expect(spentHeader.closest("[aria-sort]")).toHaveAttribute("aria-sort", "descending");
    expect(order()).toEqual(["Rent", "Groceries", "Hobby"]);

    await user.click(spentHeader);
    expect(order()).toEqual(["Hobby", "Groceries", "Rent"]);
  });

  it("in a mixed list only the row with transactions (even an empty array) has a toggle", () => {
    const withTx = staticCat({ id: "c-tx", name: "Hobby", spentCents: 1999, transactions: [] });
    const { container } = setup([groceries, withTx]);

    const toggles = container.querySelectorAll("button[aria-expanded]");
    expect(toggles).toHaveLength(1);
    expect(toggles[0].textContent).toContain("Hobby");
    expect(toggles[0]).toHaveAttribute("aria-controls");
    expect(within(rowFor("Groceries")).queryByRole("button")).not.toBeInTheDocument();
  });
});
