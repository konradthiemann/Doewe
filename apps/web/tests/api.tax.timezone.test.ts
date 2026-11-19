import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { formatDate } from "../lib/pdf/taxExport";

import { cleanupTestHousehold, ensureTestHousehold } from "./testHousehold";

// The tax year is the calendar year in Europe/Berlin
// (docs/calculations/00-grundregeln.md §1): a booking entered at 00:30 on
// 1 January belongs to the new tax year, on the page, in the PDF and in the
// day the PDF prints. Fixed UTC instants: same result in any process time zone.

const TEST_USER_ID = "test-user-tax-timezone";
const ACCOUNT_ID = "acc_tax_timezone_test";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;

async function taxYear(query: string): Promise<{ year: number; transactions: Array<{ description: string }> }> {
  const { GET } = await import("../app/api/tax/route");
  const res = await GET(new Request(`http://localhost/api/tax${query}`));
  expect(res.status).toBe(200);
  return (await res.json()) as { year: number; transactions: Array<{ description: string }> };
}

async function exportPageCount(query: string): Promise<number> {
  const { GET } = await import("../app/api/tax/export/route");
  const res = await GET(new Request(`http://localhost/api/tax/export${query}`));
  expect(res.status).toBe(200);
  const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
  return doc.getPageCount();
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "tax-timezone-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "tax-timezone-test@example.com", password: "hashed" }
  });
  const householdId = await ensureTestHousehold(prisma, user.id);
  await prisma.account.upsert({
    where: { id: ACCOUNT_ID },
    update: { userId: user.id, householdId },
    create: { id: ACCOUNT_ID, name: "Tax Time Zone Test", userId: user.id, householdId }
  });

  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  const t = (description: string, occurredAt: string) => ({
    accountId: ACCOUNT_ID,
    amountCents: -1000,
    description,
    occurredAt: new Date(occurredAt),
    taxRelevant: true
  });
  await prisma.transaction.createMany({
    data: [
      // 31 Dec 2030, 23:30 in Berlin
      t("last evening of 2030", "2030-12-31T22:30:00.000Z"),
      // 1 Jan 2031, 00:30 in Berlin — still 31 Dec 2030 in UTC
      t("first minutes of 2031", "2030-12-31T23:30:00.000Z"),
      t("summer 2031", "2031-07-01T10:00:00.000Z"),
      // 31 Dec 2031, 23:30 in Berlin
      t("last evening of 2031", "2031-12-31T22:30:00.000Z"),
      // 1 Jan 2032, 00:30 in Berlin — still 31 Dec 2031 in UTC
      t("first minutes of 2032", "2031-12-31T23:30:00.000Z")
    ]
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { accountId: ACCOUNT_ID } });
  await prisma.account.deleteMany({ where: { id: ACCOUNT_ID } });
  await cleanupTestHousehold(prisma, TEST_USER_ID);
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

describe("GET /api/tax — the tax year is the calendar year in Berlin", () => {
  it("puts a booking from the first minutes of 1 January into the new year", async () => {
    const body = await taxYear("?year=2031");
    expect(body.transactions.map((tx) => tx.description).sort()).toEqual([
      "first minutes of 2031",
      "last evening of 2031",
      "summer 2031"
    ]);
    expect((await taxYear("?year=2030")).transactions.map((tx) => tx.description)).toEqual(["last evening of 2030"]);
    expect((await taxYear("?year=2032")).transactions.map((tx) => tx.description)).toEqual(["first minutes of 2032"]);
  });

  it("defaults to the current year in Berlin", async () => {
    // 1 Jan 2031, 00:30 in Berlin — still 2030 in UTC
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2030-12-31T23:30:00.000Z") });
    expect((await taxYear("")).year).toBe(2031);
    // one hour earlier it is still 2030
    vi.setSystemTime(new Date("2030-12-31T22:30:00.000Z"));
    expect((await taxYear("")).year).toBe(2030);
  });
});

describe("GET /api/tax/export — same year window and default as the page", () => {
  it("exports the bookings of the Berlin calendar year", async () => {
    // cover page + one table page
    expect(await exportPageCount("?year=2031&includeReceipts=0")).toBe(2);
    expect(await exportPageCount("?year=2032&includeReceipts=0")).toBe(2);
    // nothing tax relevant in 2033: cover page only
    expect(await exportPageCount("?year=2033&includeReceipts=0")).toBe(1);
  });

  it("resolves the default year per request, in Berlin", async () => {
    const { TaxExportQuery } = await import("../app/api/tax/export/schema");
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2032-12-31T23:30:00.000Z") });
    expect(TaxExportQuery.parse({}).year).toBe(2033);
    expect(await exportPageCount("?includeReceipts=0")).toBe(1);
    vi.setSystemTime(new Date("2031-12-31T23:30:00.000Z"));
    expect(TaxExportQuery.parse({}).year).toBe(2032);
    expect(await exportPageCount("?includeReceipts=0")).toBe(2);
  });
});

describe("tax PDF dates", () => {
  it("prints the Berlin calendar day of a booking", () => {
    // 1 Jan 2031, 00:30 in Berlin — 31 Dec 2030 in UTC
    expect(formatDate(new Date("2030-12-31T23:30:00.000Z"), "de")).toBe("1.1.2031");
    expect(formatDate("2030-12-31T23:30:00.000Z", "en")).toBe("1/1/2031");
    // 30 June 2031, 23:30 in Berlin (summer time) — the same day in UTC
    expect(formatDate(new Date("2031-06-30T21:30:00.000Z"), "de")).toBe("30.6.2031");
    // 1 July 2031, 00:30 in Berlin — still 30 June in UTC
    expect(formatDate(new Date("2031-06-30T22:30:00.000Z"), "de")).toBe("1.7.2031");
  });
});
