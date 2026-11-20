import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { SavingsOverviewCard, type SavingsOverviewCardProps } from "./SavingsOverviewCard";

const formatCurrency = (euros: number) =>
  `${euros.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function setup(overrides: Partial<SavingsOverviewCardProps> = {}) {
  render(
    <I18nProvider>
      <SavingsOverviewCard
        savedThisMonth={250}
        netWithdrawn={0}
        plan={{ monthlyRateCents: 50_000 }}
        nextDeadline={{ year: 2027, month: 3 }}
        completedGoals={[]}
        completedGoalsSpent={0}
        formatCurrency={formatCurrency}
        dateLocale="de-DE"
        {...overrides}
      />
    </I18nProvider>
  );
}

describe("SavingsOverviewCard with a monthly rate", () => {
  it("compares what was saved this month with the monthly rate of the plan", () => {
    setup();

    expect(screen.getByText("Diesen Monat gespart")).toBeInTheDocument();
    expect(screen.getByText("250,00 €")).toBeInTheDocument();
    expect(screen.getByText("Monatsrate laut Plan")).toBeInTheDocument();
    expect(screen.getByText("500,00 €")).toBeInTheDocument();

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/50 % der Monatsrate/)).toBeInTheDocument();
    expect(screen.getByText(/Noch 250,00 € bis zur Monatsrate\./)).toBeInTheDocument();
    expect(screen.getByText(/Nächster Termin: März 2027/)).toBeInTheDocument();
  });

  it("shows no savings balance: the app does not track the savings account", () => {
    setup();
    expect(screen.queryByText("Im Spartopf")).not.toBeInTheDocument();
    expect(screen.queryByText(/Spartopf/)).not.toBeInTheDocument();
  });

  it("does not show the target of this month's deadline or a share of it", () => {
    // The old card compared the month's deposits with the full target of goals due this month.
    setup();
    expect(screen.queryByText("Geplantes Sparen")).not.toBeInTheDocument();
    expect(screen.queryByText("Ziel für diesen Monat")).not.toBeInTheDocument();
    expect(screen.queryByText(/des Ziels/)).not.toBeInTheDocument();
  });

  it("reaches 100 % only when the rate is really reached", () => {
    setup({ savedThisMonth: 497.5 }); // 99.5 % of 500
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");
    expect(screen.getByText(/99 % der Monatsrate/)).toBeInTheDocument();
    expect(screen.getByText(/Noch 2,50 € bis zur Monatsrate\./)).toBeInTheDocument();
  });

  it("says so when the rate is reached and caps the bar", () => {
    setup({ savedThisMonth: 800 });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText(/Monatsrate für diesen Monat erreicht\./)).toBeInTheDocument();
  });

  it("explains itself with an info button", () => {
    setup();
    expect(screen.getByRole("button", { name: "Erklärung: Sparübersicht" })).toBeInTheDocument();
  });
});

describe("SavingsOverviewCard without dated goals (rate 0)", () => {
  it("shows the saved amount only, without bar, rate or percentage", () => {
    setup({ plan: { monthlyRateCents: 0 }, nextDeadline: null });

    expect(screen.getByText("Diesen Monat gespart")).toBeInTheDocument();
    expect(screen.getByText("250,00 €")).toBeInTheDocument();

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Monatsrate laut Plan")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows the saved amount while the saving plan is not loaded", () => {
    setup({ plan: null, nextDeadline: null });
    expect(screen.getByText("250,00 €")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("SavingsOverviewCard: the rest of the card", () => {
  it("mentions a net withdrawal of the month", () => {
    setup({ savedThisMonth: 0, netWithdrawn: 150 });
    expect(screen.getByText("Diesen Monat hast du unterm Strich 150,00 € aus dem Ersparten zurückgeholt.")).toBeInTheDocument();
  });

  it("keeps the list of goals completed this month", () => {
    setup({
      completedGoals: [{ title: "Waschmaschine", target: 600, spent: 649.9, completedAt: "2026-11-10T11:00:00.000Z" }],
      completedGoalsSpent: 649.9
    });
    expect(screen.getByText("Diesen Monat abgeschlossene Ziele")).toBeInTheDocument();
    expect(screen.getByText("Waschmaschine")).toBeInTheDocument();
    expect(screen.getByText("649,90 €")).toBeInTheDocument();
    expect(screen.getByText("49,90 € über Ziel")).toBeInTheDocument();
    expect(screen.getByText("Ausgegeben gesamt: 649,90 €")).toBeInTheDocument();
  });
});
