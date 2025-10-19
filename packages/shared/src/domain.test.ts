import { describe, it, expect } from "vitest";

import { createTransaction } from "./domain";

describe("domain.createTransaction", () => {
  it("creates a valid transaction with ISO date", () => {
    const t = createTransaction({
      id: "tx_1",
      accountId: "acc_1",
      amountCents: -1234,
      description: "Groceries",
      occurredAt: "2025-10-19T12:00:00.000Z",
      categoryId: "cat_food"
    });
    expect(t.id).toBe("tx_1");
    expect(t.accountId).toBe("acc_1");
    expect(t.amount).toBe(-1234);
    expect(t.description).toBe("Groceries");
    expect(t.occurredAt).toBe("2025-10-19T12:00:00.000Z");
    expect(t.categoryId).toBe("cat_food");
  });

  it("validates inputs (non-empty ids, non-empty description, valid date)", () => {
    expect(() =>
      createTransaction({
        id: "",
        accountId: "acc",
        amountCents: 0,
        description: "ok",
        occurredAt: new Date()
      })
    ).toThrow();

    expect(() =>
      createTransaction({
        id: "tx",
        accountId: "",
        amountCents: 0,
        description: "ok",
        occurredAt: new Date()
      })
    ).toThrow();

    expect(() =>
      createTransaction({
        id: "tx",
        accountId: "acc",
        amountCents: 0,
        description: "   ",
        occurredAt: new Date()
      })
    ).toThrow();

    expect(() =>
      createTransaction({
        id: "tx",
        accountId: "acc",
        amountCents: 0,
        description: "ok",
        occurredAt: "invalid-date"
      })
    ).toThrow();
  });
});