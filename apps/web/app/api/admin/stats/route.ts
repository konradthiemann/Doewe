/**
 * GET /api/admin/stats — aggregierte Betriebskennzahlen über alle Haushalte
 * hinweg, für das Symfony-Control-Plane-Backend.
 *
 * Auth: `Authorization: Bearer <DOEWE_SERVICE_TOKEN>` (isAuthorizedService),
 * NICHT die Household-Session wie sonst überall — dieser Endpoint ist
 * bewusst der einzige, der Haushaltsgrenzen (Teil D) übergreift.
 *
 * Bewusst NUR Zählwerte/Summen, kein Per-Haushalt-Breakdown, keine Namen,
 * keine Beträge unterhalb der Aggregat-Ebene — das ist Konrads Familien-
 * Finanzdaten, kein Hobby-Projekt wie die anderen Apps im Workspace.
 *
 * Body-Shape:
 * {
 *   households: { total, multiMember },
 *   users: { total, pushEnabled },
 *   accounts: { total },
 *   transactions: { total, categorized, taxRelevant, fromReceiptScan },
 *   attachments: { count, totalBytes },
 *   recurringTransactions: { active },
 *   budgets: { total, completed }
 * }
 */
import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { isAuthorizedService } from "../../../../lib/serviceAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedService(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    householdsTotal,
    householdsMultiMember,
    usersTotal,
    usersPushEnabled,
    accountsTotal,
    transactionsTotal,
    transactionsCategorized,
    transactionsTaxRelevant,
    transactionsFromReceiptScan,
    attachmentsAgg,
    recurringActive,
    budgetsTotal,
    budgetsCompleted
  ] = await Promise.all([
    prisma.household.count(),
    // Households with more than one member. Prisma has no direct "count
    // where relation length > 1" — group by householdId instead.
    prisma.householdMember
      .groupBy({
        by: ["householdId"],
        _count: { householdId: true },
        having: { householdId: { _count: { gt: 1 } } }
      })
      .then((grouped) => grouped.length),
    prisma.user.count(),
    prisma.user.count({ where: { pushSubscriptions: { some: {} } } }),
    prisma.account.count({ where: { deletedAt: null } }),
    prisma.transaction.count({ where: { deletedAt: null } }),
    prisma.transaction.count({ where: { deletedAt: null, categoryId: { not: null } } }),
    prisma.transaction.count({ where: { deletedAt: null, taxRelevant: true } }),
    prisma.receiptLineItem.findMany({ distinct: ["transactionId"], select: { transactionId: true } }).then((rows) => rows.length),
    prisma.attachment.aggregate({ _count: { id: true }, _sum: { sizeBytes: true } }),
    prisma.recurringTransaction.count({ where: { deletedAt: null } }),
    prisma.budget.count({ where: { deletedAt: null } }),
    prisma.budget.count({ where: { deletedAt: null, completedAt: { not: null } } })
  ]);

  return NextResponse.json({
    households: { total: householdsTotal, multiMember: householdsMultiMember },
    users: { total: usersTotal, pushEnabled: usersPushEnabled },
    accounts: { total: accountsTotal },
    transactions: {
      total: transactionsTotal,
      categorized: transactionsCategorized,
      taxRelevant: transactionsTaxRelevant,
      fromReceiptScan: transactionsFromReceiptScan
    },
    attachments: {
      count: attachmentsAgg._count.id,
      totalBytes: attachmentsAgg._sum.sizeBytes ?? 0
    },
    recurringTransactions: { active: recurringActive },
    budgets: { total: budgetsTotal, completed: budgetsCompleted }
  });
}
