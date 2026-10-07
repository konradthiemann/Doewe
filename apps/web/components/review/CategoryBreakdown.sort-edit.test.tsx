import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { CategoryBreakdown, type ReviewCategory, type ReviewCategoryTransaction } from "./CategoryBreakdown";

const formatCurrency = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;

function cat(overrides: Partial<ReviewCategory> & Pick<ReviewCategory, "id" | "name">): ReviewCategory {
  return { spentCents: 0, budgetCents: null, transactionCount: 0, transactions: [], ...overrides };
}

function setup(
  categories: ReviewCategory[],
  onEditTransaction?: (tx: ReviewCategoryTransaction) => void,
  outcomeCents = 10000
) {
  return render(
    <I18nProvider>
      <CategoryBreakdown
        categories={categories}
        outcomeCents={outcomeCents}
        formatCurrency={formatCurrency}
        dateLocale="de-DE"
        onEditTransaction={onEditTransaction}
      />
    </I18nProvider>
  );
}

const tx1: ReviewCategoryTransaction = {
  id: "t1",
  description: "Supermarket",
  amountCents: 4000,
  occurredAt: "2025-03-10T12:00:00.000Z",
  accountId: "acc-1",
  categoryId: "c-food",
  taxRelevant: false
};
const tx2: ReviewCategoryTransaction = {
  id: "t2",
  description: "Bakery",
  amountCents: 2000,
  occurredAt: "2025-03-05T12:00:00.000Z",
  accountId: "acc-1",
  categoryId: "c-food",
  taxRelevant: true
};

const food = cat({ id: "c-food", name: "Food", spentCents: 6000, transactionCount: 2, transactions: [tx1, tx2] });
const fun = cat({ id: "c-fun", name: "Fun", spentCents: 4000, budgetCents: 5000 });
const rent = cat({ id: "c-rent", name: "Rent", spentCents: 500, budgetCents: 9000 });
const misc = cat({ id: "c-misc", name: "Misc", spentCents: 100 });

// API order deliberately differs from every sort order tested below.
const apiOrder = [fun, misc, food, rent];

const headerButton = (name: string) => screen.getByRole("button", { name });
/** Category toggle buttons (the only buttons carrying aria-expanded), in DOM order. */
const categoryOrder = () =>
  screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-expanded"))
    .map((b) => b.textContent ?? "")
    .map((text) => ["Food", "Fun", "Rent", "Misc"].find((n) => text.includes(n)));
const sortState = (name: string) => headerButton(name).closest("[aria-sort]")?.getAttribute("aria-sort");

describe("CategoryBreakdown - sortable headers", () => {
  it("renders all five column headers as buttons with aria-sort=none by default", () => {
    setup(apiOrder);
    for (const name of ["Kategorie", "Verteilung", "Ausgegeben", "Budget", "Status"]) {
      expect(headerButton(name)).toBeInTheDocument();
      expect(sortState(name)).toBe("none");
    }
  });

  it("keeps the API order without any click", () => {
    setup(apiOrder);
    expect(categoryOrder()).toEqual(["Fun", "Misc", "Food", "Rent"]);
  });

  it("sorts 'Ausgegeben' descending on first click and ascending on second", async () => {
    const user = userEvent.setup();
    setup(apiOrder);

    await user.click(headerButton("Ausgegeben"));
    expect(sortState("Ausgegeben")).toBe("descending");
    expect(categoryOrder()).toEqual(["Food", "Fun", "Rent", "Misc"]);

    await user.click(headerButton("Ausgegeben"));
    expect(sortState("Ausgegeben")).toBe("ascending");
    expect(categoryOrder()).toEqual(["Misc", "Rent", "Fun", "Food"]);
  });

  it("sorts 'Kategorie' ascending (A-Z) on first click and descending on second", async () => {
    const user = userEvent.setup();
    setup(apiOrder);

    await user.click(headerButton("Kategorie"));
    expect(sortState("Kategorie")).toBe("ascending");
    expect(categoryOrder()).toEqual(["Food", "Fun", "Misc", "Rent"]);

    await user.click(headerButton("Kategorie"));
    expect(sortState("Kategorie")).toBe("descending");
    expect(categoryOrder()).toEqual(["Rent", "Misc", "Fun", "Food"]);
  });

  it("clicking another column resets to that column's default and clears aria-sort on the previous one", async () => {
    const user = userEvent.setup();
    setup(apiOrder);

    await user.click(headerButton("Ausgegeben"));
    await user.click(headerButton("Ausgegeben")); // now ascending
    await user.click(headerButton("Kategorie"));

    expect(sortState("Kategorie")).toBe("ascending");
    expect(sortState("Ausgegeben")).toBe("none");
    expect(categoryOrder()).toEqual(["Food", "Fun", "Misc", "Rent"]);
  });

  it("keeps categories without budget at the end when sorting by 'Budget' (both directions)", async () => {
    const user = userEvent.setup();
    setup(apiOrder);

    await user.click(headerButton("Budget"));
    expect(sortState("Budget")).toBe("descending");
    expect(categoryOrder()).toEqual(["Rent", "Fun", "Misc", "Food"]);

    await user.click(headerButton("Budget"));
    expect(sortState("Budget")).toBe("ascending");
    expect(categoryOrder()).toEqual(["Fun", "Rent", "Misc", "Food"]);
  });

  it("sorts by 'Status' (spent - budget) with null budgets last", async () => {
    const user = userEvent.setup();
    setup(apiOrder);

    // diffs: Fun -1000, Rent -8500, no budget: Misc, Food
    await user.click(headerButton("Status"));
    expect(categoryOrder()).toEqual(["Fun", "Rent", "Misc", "Food"]);
    await user.click(headerButton("Status"));
    expect(categoryOrder()).toEqual(["Rent", "Fun", "Misc", "Food"]);
  });

  it("sorts by 'Verteilung' descending on first click", async () => {
    const user = userEvent.setup();
    setup([misc, food, cat({ id: "c-x", name: "Fun", spentCents: 3000 })]);
    await user.click(headerButton("Verteilung"));
    expect(sortState("Verteilung")).toBe("descending");
    expect(categoryOrder()).toEqual(["Food", "Fun", "Misc"]);
  });
});

describe("CategoryBreakdown - editing bookings", () => {
  it("renders each booking as a button and calls onEditTransaction with the transaction object", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    setup([food, fun], onEdit);

    await user.click(screen.getByRole("button", { name: /Food/ }));
    const btn1 = screen.getByRole("button", { name: /Supermarket/ });
    const btn2 = screen.getByRole("button", { name: /Bakery/ });
    expect(btn1).toBeInTheDocument();

    await user.click(btn2);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(tx2);

    await user.click(btn1);
    expect(onEdit).toHaveBeenLastCalledWith(tx1);
  });

  it("does not collapse the category when a booking is clicked", async () => {
    const user = userEvent.setup();
    setup([food], vi.fn());
    const toggle = screen.getByRole("button", { name: /Food/ });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /Supermarket/ }));
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("is keyboard operable (Enter on a focused booking button)", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    setup([food], onEdit);
    await user.click(screen.getByRole("button", { name: /Food/ }));
    screen.getByRole("button", { name: /Bakery/ }).focus();
    await user.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledWith(tx2);
  });

  it("renders bookings as plain rows (no buttons) without onEditTransaction", async () => {
    const user = userEvent.setup();
    setup([food, fun]);
    const toggle = screen.getByRole("button", { name: /Food/ });
    await user.click(toggle);
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(within(panel).getByText("Supermarket")).toBeInTheDocument();
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
  });
});
