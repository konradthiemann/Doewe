import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// Integrationstest für GET /api/recurring-transactions/export?year=YYYY (CSV).
const TEST_USER_ID = "test-user-recurring-export";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let householdId: string;
let accountId: string;
const otherUserId = "test-user-recurring-export-other";
const otherAccountId = "acc_recurring_export_other";

const req = (query = "year=2026") => new Request(`http://localhost/api/recurring-transactions/export?${query}`);

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  const user = await prisma.user.upsert({
    where: { email: "recurring-export-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "recurring-export-test@example.com", password: "hashed" }
  });
  householdId = await ensureTestHousehold(prisma, user.id, "Recurring Export Household");
  const account = await prisma.account.upsert({
    where: { id: "acc_recurring_export" },
    update: { userId: user.id, householdId },
    create: { id: "acc_recurring_export", name: "Export Account", userId: user.id, householdId }
  });
  accountId = account.id;

  const savings = await prisma.category.upsert({
    where: { householdId_name: { householdId, name: "Sparen" } },
    update: {},
    create: { name: "Sparen", userId: user.id, householdId }
  });
  const income = await prisma.category.upsert({
    where: { householdId_name: { householdId, name: "Gehalt" } },
    update: { isIncome: true },
    create: { name: "Gehalt", userId: user.id, householdId, isIncome: true }
  });

  await prisma.recurringTransaction.deleteMany({ where: { accountId } });
  const common = { accountId, frequency: "MONTHLY", intervalMonths: 1, dayOfMonth: 1, nextOccurrence: new Date(2026, 0, 1) };
  await prisma.recurringTransaction.createMany({
    data: [
      { ...common, description: "Miete", amountCents: -80000 },
      { ...common, description: "ETF", amountCents: -20000, categoryId: savings.id },
      { ...common, description: "Lohn", amountCents: 300000, categoryId: income.id },
      { ...common, description: "Gelöscht", amountCents: -1000, deletedAt: new Date() }
    ]
  });

  // Fremder Haushalt darf nie auftauchen.
  const other = await prisma.user.upsert({
    where: { email: "recurring-export-other@example.com" },
    update: {},
    create: { id: otherUserId, email: "recurring-export-other@example.com", password: "hashed" }
  });
  const otherHousehold = await ensureTestHousehold(prisma, other.id, "Other Household");
  await prisma.account.upsert({
    where: { id: otherAccountId },
    update: { userId: other.id, householdId: otherHousehold },
    create: { id: otherAccountId, name: "Other", userId: other.id, householdId: otherHousehold }
  });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: otherAccountId } });
  await prisma.recurringTransaction.create({
    data: { ...common, accountId: otherAccountId, description: "FremdeMiete", amountCents: -5000 }
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

describe("GET /api/recurring-transactions/export", () => {
  it("returns a CSV attachment with expenses and savings separated", async () => {
    const { GET } = await import("../app/api/recurring-transactions/export/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("wiederkehrend-2026.csv");
    expect(res.headers.get("cache-control")).toContain("no-store");

    const body = await res.text();
    expect(body).toContain("Miete;");
    expect(body).toContain("ETF;Sparen;Sparen;");
    expect(body.split("\r\n").find((l) => l.startsWith("Summe Ausgaben"))).toContain(";9600,00");
    expect(body.split("\r\n").find((l) => l.startsWith("Summe Sparen"))).toContain(";2400,00");
  });

  it("omits income, soft-deleted and other households' items", async () => {
    const { GET } = await import("../app/api/recurring-transactions/export/route");
    const body = await (await GET(req())).text();
    expect(body).not.toContain("Lohn");
    expect(body).not.toContain("Gelöscht");
    expect(body).not.toContain("FremdeMiete");
  });

  it("rejects an invalid year with 400", async () => {
    const { GET } = await import("../app/api/recurring-transactions/export/route");
    expect((await GET(req("year=abc"))).status).toBe(400);
  });
});
