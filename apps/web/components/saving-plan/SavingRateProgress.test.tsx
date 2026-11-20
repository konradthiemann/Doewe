import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../lib/i18n";

import { SavingRateProgress } from "./SavingRateProgress";

const formatCents = (cents: number) =>
  `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function setup(savedCents: number, monthOver = false) {
  render(
    <I18nProvider>
      <SavingRateProgress savedCents={savedCents} rateCents={45_000} formatCents={formatCents} monthOver={monthOver} />
    </I18nProvider>
  );
}

describe("SavingRateProgress", () => {
  it("shows the share and what is still to go in the running month", () => {
    setup(36_727);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "82");
    expect(screen.getByText(/82 % der Monatsrate · Noch 82,73 € bis zur Monatsrate\./)).toBeInTheDocument();
  });

  it("says what was missing in a month that is over", () => {
    setup(36_727, true);
    expect(screen.getByText(/82,73 € unter der Monatsrate\./)).toBeInTheDocument();
  });

  it("reaches 100 % only at the full rate", () => {
    setup(44_999, true);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");
    setup(45_000, true);
    expect(screen.getByText(/Monatsrate erreicht\./)).toBeInTheDocument();
  });
});
