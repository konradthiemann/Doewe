import { afterAll, beforeAll, describe, expect, it } from "vitest";

// pretest (siehe tests/setup.ts) läuft: prisma generate && db push && seed.
// Auth wird über TEST_USER_ID_BYPASS umgangen (siehe lib/auth.ts).
const TEST_USER_ID = "test-user-recurring";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testAccountId: string;

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "recurring-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "recurring-test@example.com", password: "hashed" }
  });
  testUserId = user.id;

  const account = await prisma.account.upsert({
    where: { id: "acc_recurring_test" },
    update: { userId: user.id },
    create: { id: "acc_recurring_test", name: "Recurring Test Account", userId: user.id }
  });
  testAccountId = account.id;

  await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
});

afterAll(async () => {
  if (prisma) {
    await prisma.recurringTransaction.deleteMany({ where: { accountId: testAccountId } });
    await prisma.account.deleteMany({ where: { id: testAccountId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  }
});

describe("/api/recurring-transactions", () => {
  it("pins nextOccurrence to an explicit startDate and derives dayOfMonth", async () => {
    const routes = await import("../app/api/recurring-transactions/route");

    const res = await routes.POST(
      new Request("http://localhost/api/recurring-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          amountCents: -1999,
          description: "Streaming-Abo",
          intervalMonths: 1,
          startDate: "2099-06-15"
        })
      })
    );
    expect(res.status).toBe(201);
    const created: {
      id: string;
      dayOfMonth: number;
      nextOccurrence: string;
      frequency: string;
    } = await res.json();

    const occ = new Date(created.nextOccurrence);
    expect(occ.getFullYear()).toBe(2099);
    expect(occ.getMonth()).toBe(5); // Juni (0-basiert)
    expect(occ.getDate()).toBe(15);
    expect(created.dayOfMonth).toBe(15);
    expect(created.frequency).toBe("MONTHLY");
  }, 20000);

  it("keeps the legacy auto-computed nextOccurrence when no startDate is given", async () => {
    const routes = await import("../app/api/recurring-transactions/route");

    const res = await routes.POST(
      new Request("http://localhost/api/recurring-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          amountCents: -85000,
          description: "Miete",
          intervalMonths: 1,
          dayOfMonth: 1
        })
      })
    );
    expect(res.status).toBe(201);
    const created: { dayOfMonth: number; nextOccurrence: string } = await res.json();
    expect(created.dayOfMonth).toBe(1);
    // nextOccurrence fällt auf den 1. (dieser oder nächster Monat) → Tag === 1.
    expect(new Date(created.nextOccurrence).getDate()).toBe(1);
  }, 20000);

  it("lets an explicit dayOfMonth and startDate coexist independently", async () => {
    const routes = await import("../app/api/recurring-transactions/route");

    const res = await routes.POST(
      new Request("http://localhost/api/recurring-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          amountCents: -2500,
          description: "Abo mit erster Zahlung später",
          intervalMonths: 1,
          dayOfMonth: 20,
          startDate: "2099-06-15"
        })
      })
    );
    expect(res.status).toBe(201);
    const created: { dayOfMonth: number; nextOccurrence: string } = await res.json();
    // startDate steuert die erste Buchung; dayOfMonth bleibt der explizit gewählte Wert.
    expect(created.dayOfMonth).toBe(20);
    expect(new Date(created.nextOccurrence).getDate()).toBe(15);
  }, 20000);

  it("updates nextOccurrence when startDate is changed via PATCH", async () => {
    const routes = await import("../app/api/recurring-transactions/route");
    const detailRoutes = await import("../app/api/recurring-transactions/[id]/route");

    const createRes = await routes.POST(
      new Request("http://localhost/api/recurring-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          amountCents: -1200,
          description: "Zeitschrift",
          intervalMonths: 3,
          dayOfMonth: 10
        })
      })
    );
    const created: { id: string } = await createRes.json();

    const patchRes = await detailRoutes.PATCH(
      new Request(`http://localhost/api/recurring-transactions/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2099-03-05" })
      }),
      { params: { id: created.id } }
    );
    expect(patchRes.status).toBe(200);
    const updated: { dayOfMonth: number; nextOccurrence: string } = await patchRes.json();
    const occ = new Date(updated.nextOccurrence);
    expect(occ.getFullYear()).toBe(2099);
    expect(occ.getMonth()).toBe(2); // März
    expect(occ.getDate()).toBe(5);
    expect(updated.dayOfMonth).toBe(5);
  }, 20000);

  it("rejects an invalid startDate (400)", async () => {
    const routes = await import("../app/api/recurring-transactions/route");

    const res = await routes.POST(
      new Request("http://localhost/api/recurring-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: testAccountId,
          amountCents: -500,
          description: "Ungültiges Datum",
          startDate: "2099-02-31"
        })
      })
    );
    expect(res.status).toBe(400);
  }, 20000);
});
