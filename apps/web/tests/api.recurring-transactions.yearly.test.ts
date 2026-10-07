import type { RecurringYearMatrix } from "@doewe/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integrationstest für GET /api/recurring-transactions/yearly?year=YYYY.
// Jahr 2037 mit Ankern in der Zukunft, damit der Cron-Test (bucht global alle
// fälligen Daueraufträge der gemeinsamen DB) nicht gestört wird.
const TEST_USER_ID = "test-user-recurring-yearly";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

const YEAR = 2037;
const accountId = "acc_recurring_yearly";
const otherUserId = "test-user-recurring-yearly-other";
const otherAccountId = "acc_recurring_yearly_other";

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;

const req = (query = `year=${YEAR}`) => new Request(`http://localhost/api/recurring-transactions/yearly?${query}`);

async function getMatrix(query?: string): Promise<RecurringYearMatrix> {
  const { GET } = await import("../app/api/recurring-transactions/yearly/route");
  const res = await GET(req(query));
  expect(res.status).toBe(200);
  return (await res.json()) as RecurringYearMatrix;
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "recurring-yearly-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "recurring-yearly-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id, "Recurring Yearly Household");
  await prisma.account.upsert({
    where: { id: accountId },
    update: { userId: user.id, householdId },
    create: { id: accountId, name: "Yearly Account", userId: user.id, householdId }
  });

  const savings = await prisma.category.upsert({
    where: { householdId_name: { householdId, name: "Savings" } },
    update: {},
    create: { name: "Savings", userId: user.id, householdId }
  });
  const income = await prisma.category.upsert({
    where: { householdId_name: { householdId, name: "Gehalt" } },
    update: { isIncome: true },
    create: { name: "Gehalt", userId: user.id, householdId, isIncome: true }
  });
  const insurance = await prisma.category.upsert({
    where: { householdId_name: { householdId, name: "Versicherung" } },
    update: {},
    create: { name: "Versicherung", userId: user.id, householdId }
  });

  await prisma.recurringTransaction.deleteMany({ where: { accountId } });
  const common = { accountId, frequency: "MONTHLY", dayOfMonth: 1 };
  const jan = new Date(YEAR, 0, 1);
  await prisma.recurringTransaction.createMany({
    data: [
      { ...common, id: "rec_yearly_salary", description: "Gehalt", amountCents: 300000, intervalMonths: 1, nextOccurrence: jan, categoryId: income.id },
      { ...common, id: "rec_yearly_rent", description: "Miete", amountCents: -80000, intervalMonths: 1, nextOccurrence: jan },
      { ...common, id: "rec_yearly_etf", description: "ETF", amountCents: -20000, intervalMonths: 1, nextOccurrence: jan, categoryId: savings.id },
      { ...common, id: "rec_yearly_ins", description: "Versicherung", amountCents: -30000, intervalMonths: 3, nextOccurrence: new Date(YEAR, 1, 1), categoryId: insurance.id },
      { ...common, id: "rec_yearly_deleted", description: "Geloescht", amountCents: -1000, intervalMonths: 1, nextOccurrence: jan, deletedAt: new Date() }
    ]
  });
  await prisma.recurringTransactionSkip.deleteMany({ where: { recurringId: "rec_yearly_rent" } });
  await prisma.recurringTransactionSkip.create({ data: { recurringId: "rec_yearly_rent", year: YEAR, month: 7 } });
  // Skip eines anderen Jahres darf keine Wirkung haben.
  await prisma.recurringTransactionSkip.create({ data: { recurringId: "rec_yearly_rent", year: YEAR + 1, month: 3 } });

  // Fremder Haushalt darf nie auftauchen.
  const other = await prisma.user.upsert({
    where: { email: "recurring-yearly-other@example.com" },
    update: {},
    create: { id: otherUserId, email: "recurring-yearly-other@example.com", password: "hashed" }
  });
  const otherHousehold = await ensureTestHousehold(prisma, other.id, "Other Yearly Household");
  await prisma.account.upsert({
    where: { id: otherAccountId },
    update: { userId: other.id, householdId: otherHousehold },
    create: { id: otherAccountId, name: "Other", userId: other.id, householdId: otherHousehold }
  });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: otherAccountId } });
  await prisma.recurringTransaction.create({
    data: { ...common, id: "rec_yearly_foreign", accountId: otherAccountId, description: "FremdeMiete", amountCents: -5000, intervalMonths: 1, nextOccurrence: jan }
  });
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.recurringTransaction.deleteMany({ where: { accountId: { in: [accountId, otherAccountId] } } });
  await prisma.account.deleteMany({ where: { id: { in: [accountId, otherAccountId] } } });
  await prisma.category.deleteMany({ where: { householdId } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await cleanupTestHousehold(prisma, otherUserId);
  await prisma.user.deleteMany({ where: { id: { in: [TEST_USER_ID, otherUserId] } } });
  await prisma.$disconnect();
});

describe("GET /api/recurring-transactions/yearly", () => {
  it("returns the matrix grouped into income, expenses and savings", async () => {
    const data = await getMatrix();
    expect(data.year).toBe(YEAR);
    expect(data.income.rows.map((r) => r.description)).toEqual(["Gehalt"]);
    expect(data.savings.rows.map((r) => r.description)).toEqual(["ETF"]);
    expect(data.expenses.rows.map((r) => r.description).sort()).toEqual(["Miete", "Versicherung"]);
    expect(data.income.rows[0].monthlyCents).toEqual(Array.from({ length: 12 }, () => 300000));
    expect(data.savings.rows[0].kind).toBe("savings");
    expect(data.savings.rows[0].totalCents).toBe(-240000);
  });

  it("sets categoryName and null for items without category", async () => {
    const data = await getMatrix();
    expect(data.income.rows[0].categoryName).toBe("Gehalt");
    expect(data.savings.rows[0].categoryName).toBe("Savings");
    const rent = data.expenses.rows.find((r) => r.description === "Miete");
    expect(rent?.categoryName).toBeNull();
    expect(rent?.categoryId).toBeNull();
  });

  it("shows the quarterly insurance only in Feb, May, Aug, Nov", async () => {
    const data = await getMatrix();
    const ins = data.expenses.rows.find((r) => r.description === "Versicherung");
    const expected = Array.from({ length: 12 }, () => 0);
    for (const month of [2, 5, 8, 11]) expected[month - 1] = -30000;
    expect(ins?.monthlyCents).toEqual(expected);
  });

  it("zeroes a skipped month of the requested year only", async () => {
    const data = await getMatrix();
    const rent = data.expenses.rows.find((r) => r.description === "Miete");
    expect(rent?.monthlyCents[6]).toBe(0);
    expect(rent?.monthlyCents.filter((c) => c === -80000)).toHaveLength(11);
    expect(rent?.totalCents).toBe(-880000);
  });

  it("computes net.monthlyTotalsCents as the signed sum over all groups", async () => {
    const data = await getMatrix();
    for (let i = 0; i < 12; i += 1) {
      const sum = data.income.monthlyTotalsCents[i] + data.expenses.monthlyTotalsCents[i] + data.savings.monthlyTotalsCents[i];
      expect(data.net.monthlyTotalsCents[i]).toBe(sum);
    }
    // Januar: 300000 - 80000 - 20000 (keine Versicherung)
    expect(data.net.monthlyTotalsCents[0]).toBe(200000);
    // Juli: Miete übersprungen
    expect(data.net.monthlyTotalsCents[6]).toBe(300000 - 20000);
  });

  it("omits other households' and soft-deleted items", async () => {
    const data = await getMatrix();
    const descriptions = [...data.income.rows, ...data.expenses.rows, ...data.savings.rows].map((r) => r.description);
    expect(descriptions).not.toContain("FremdeMiete");
    expect(descriptions).not.toContain("Geloescht");
  });

  it("keeps rows with zeros when the anchor lies after the requested year", async () => {
    const data = await getMatrix("year=2036");
    expect(data.year).toBe(2036);
    expect(data.expenses.rows.length).toBeGreaterThan(0);
    for (const row of [...data.income.rows, ...data.expenses.rows, ...data.savings.rows]) {
      expect(row.totalCents).toBe(0);
    }
  });

  it("defaults to the current year without a year parameter", async () => {
    const data = await getMatrix("");
    expect(data.year).toBe(new Date().getFullYear());
  });

  it("rejects invalid years with 400", async () => {
    const { GET } = await import("../app/api/recurring-transactions/yearly/route");
    for (const q of ["year=abc", "year=1999"]) {
      const res = await GET(req(q));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid query" });
    }
  });

  it("rejects unauthenticated requests", async () => {
    // Bypass-User ohne Haushaltsmitgliedschaft -> getSessionUser() liefert null (siehe api.tax-export.test.ts).
    process.env.TEST_USER_ID_BYPASS = "test-user-recurring-yearly-no-household";
    vi.resetModules();
    const { GET } = await import("../app/api/recurring-transactions/yearly/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
    process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;
    vi.resetModules();
  });
});
