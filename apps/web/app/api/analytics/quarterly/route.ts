import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.account.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!account) {
    return NextResponse.json({ error: "No account found for user" }, { status: 404 });
  }

  const accountId = account.id;
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentYear = now.getFullYear();

  // Get last 3 months including current month
  const months: Array<{ month: number; year: number }> = [];
  for (let i = 2; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - i, 1);
    months.push({ month: date.getMonth() + 1, year: date.getFullYear() });
  }

  // Resolve savings category
  const savingsCategory = await prisma.category.findFirst({
    where: { name: "Savings", userId: user.id },
    select: { id: true }
  });
  const savingsCatId = savingsCategory?.id ?? null;

  // Fetch data for each month
  const quarters = await Promise.all(
    months.map(async ({ month, year }) => {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);

      const txs = await prisma.transaction.findMany({
        where: {
          accountId,
          occurredAt: { gte: start, lt: end }
        },
        select: { amountCents: true, categoryId: true }
      });

      let income = 0;
      let outcome = 0;
      let savings = 0;

      for (const t of txs) {
        const amt = t.amountCents;
        if (amt >= 0) {
          income += amt;
        } else {
          if (savingsCatId && t.categoryId === savingsCatId) {
            savings += -amt;
          } else {
            outcome += -amt;
          }
        }
      }

      // Calculate balance at end of month (all transactions up to end of month)
      const allTxsUpToEnd = await prisma.transaction.findMany({
        where: { accountId, occurredAt: { lt: end } },
        select: { amountCents: true }
      });
      let balance = 0;
      for (const t of allTxsUpToEnd) {
        balance += t.amountCents;
      }

      return {
        month,
        year,
        incomeCents: income,
        outcomeCents: outcome,
        savingsCents: savings,
        balanceCents: balance
      };
    })
  );

  // Calculate totals
  const totalIncomeCents = quarters.reduce((sum, q) => sum + q.incomeCents, 0);
  const totalOutcomeCents = quarters.reduce((sum, q) => sum + q.outcomeCents, 0);
  const totalSavingsCents = quarters.reduce((sum, q) => sum + q.savingsCents, 0);

  return NextResponse.json({
    quarters,
    totals: {
      incomeCents: totalIncomeCents,
      outcomeCents: totalOutcomeCents,
      savingsCents: totalSavingsCents
    }
  });
}
