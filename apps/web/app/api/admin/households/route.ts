/**
 * GET /api/admin/households — Haushaltsliste für das Symfony-Control-Plane-
 * Backend, inkl. Nutzungs-Kennzahlen je Haushalt.
 *
 * Auth: `Authorization: Bearer <DOEWE_SERVICE_TOKEN>` (isAuthorizedService),
 * NICHT die Household-Session — analog zu `admin/stats/route.ts`, dieser
 * Endpoint übergreift bewusst Haushaltsgrenzen (Teil D).
 *
 * `receiptScanCount` ist bewusst PRO Haushalt (nicht nur global wie in
 * `admin/stats`) — das speist eine künftige Preis-Tier-Entscheidung.
 *
 * Body-Shape:
 * {
 *   households: [{ id, name, memberCount, createdAt, accountsCount, transactionsCount, receiptScanCount }]
 * }
 *
 * Der Haushalt des geteilten öffentlichen Demo-Accounts (`DEMO_EMAIL`, siehe
 * `lib/demoConstants`) wird ausgeschlossen — synthetische Showcase-Daten
 * (36 Monate generierte Transaktionen), kein echter Haushalt.
 */
import { NextResponse } from "next/server";

import { DEMO_EMAIL } from "../../../../lib/demoConstants";
import { prisma } from "../../../../lib/prisma";
import { isAuthorizedService } from "../../../../lib/serviceAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedService(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demoUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { householdMember: { select: { householdId: true } } }
  });
  const demoHouseholdId = demoUser?.householdMember?.householdId ?? null;

  const households = await prisma.household.findMany({
    where: demoHouseholdId ? { id: { not: demoHouseholdId } } : undefined,
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
  const householdIds = households.map((h) => h.id);

  // Members and accounts carry householdId directly — a single groupBy each.
  const [memberCounts, accounts] = await Promise.all([
    householdIds.length
      ? prisma.householdMember.groupBy({
          by: ["householdId"],
          where: { householdId: { in: householdIds } },
          _count: { householdId: true }
        })
      : [],
    householdIds.length
      ? prisma.account.findMany({
          where: { householdId: { in: householdIds } },
          select: { id: true, householdId: true }
        })
      : []
  ]);
  const memberCountMap = new Map(memberCounts.map((m) => [m.householdId, m._count.householdId]));

  const accountIds = accounts.map((a) => a.id);
  const accountToHousehold = new Map(accounts.map((a) => [a.id, a.householdId]));

  const accountCountMap = new Map<string, number>();
  for (const a of accounts) {
    accountCountMap.set(a.householdId, (accountCountMap.get(a.householdId) ?? 0) + 1);
  }

  // Transaction/ReceiptLineItem have no householdId column — they hang off
  // Account, so aggregate per account first and roll up to household in JS
  // (Teil D: household is the tenant, but the schema scopes via accountId).
  const [txByAccount, receiptRows] = await Promise.all([
    accountIds.length
      ? prisma.transaction.groupBy({
          by: ["accountId"],
          where: { accountId: { in: accountIds } },
          _count: { id: true }
        })
      : [],
    accountIds.length
      ? prisma.receiptLineItem.findMany({
          where: { transaction: { accountId: { in: accountIds } } },
          select: { transactionId: true, transaction: { select: { accountId: true } } },
          distinct: ["transactionId"]
        })
      : []
  ]);

  const transactionCountMap = new Map<string, number>();
  for (const t of txByAccount) {
    const householdId = accountToHousehold.get(t.accountId);
    if (!householdId) continue;
    transactionCountMap.set(householdId, (transactionCountMap.get(householdId) ?? 0) + t._count.id);
  }

  const receiptScanCountMap = new Map<string, number>();
  for (const row of receiptRows) {
    const householdId = accountToHousehold.get(row.transaction.accountId);
    if (!householdId) continue;
    receiptScanCountMap.set(householdId, (receiptScanCountMap.get(householdId) ?? 0) + 1);
  }

  return NextResponse.json({
    households: households.map((h) => ({
      id: h.id,
      name: h.name,
      createdAt: h.createdAt,
      memberCount: memberCountMap.get(h.id) ?? 0,
      accountsCount: accountCountMap.get(h.id) ?? 0,
      transactionsCount: transactionCountMap.get(h.id) ?? 0,
      receiptScanCount: receiptScanCountMap.get(h.id) ?? 0
    }))
  });
}
