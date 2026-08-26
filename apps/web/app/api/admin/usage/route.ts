/**
 * GET /api/admin/usage — tägliche Zeitreihe für das Symfony-Control-Plane-
 * Backend (Nutzungs-Dashboard).
 *
 * Auth: `Authorization: Bearer <DOEWE_SERVICE_TOKEN>` (isAuthorizedService),
 * NICHT die Household-Session — analog zu `admin/stats/route.ts`, dieser
 * Endpoint übergreift bewusst Haushaltsgrenzen (Teil D).
 *
 * Query: `?days=30` (1 ≤ days ≤ 365, Default 30). Deckt die letzten `days`
 * volle UTC-Tage ab (heute eingeschlossen).
 *
 * Body-Shape:
 * {
 *   days, from, to,
 *   series: [{ date: "YYYY-MM-DD", logins, transactions, receiptScans }]
 * }
 *
 * - `logins` — Anzahl `LoginEvent`-Zeilen an diesem Tag
 * - `transactions` — Anzahl an diesem Tag angelegter, nicht soft-gelöschter Transaktionen
 * - `receiptScans` — Anzahl an diesem Tag angelegter Belege (distinct `transactionId`
 *   auf `ReceiptLineItem`, damit eine mehrzeilige Quittung nur einmal zählt)
 */
import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { isAuthorizedService } from "../../../../lib/serviceAuth";

import { UsageQuery } from "./schema";

export const dynamic = "force-dynamic";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  if (!isAuthorizedService(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = UsageQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { days } = parsed.data;

  const now = new Date();
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const start = new Date(endExclusive);
  start.setUTCDate(start.getUTCDate() - days);

  type Bucket = { logins: number; transactions: number; receiptScans: number };
  const buckets = new Map<string, Bucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    buckets.set(dayKey(d), { logins: 0, transactions: 0, receiptScans: 0 });
  }

  const [logins, transactions, receiptRows] = await Promise.all([
    prisma.loginEvent.findMany({
      where: { createdAt: { gte: start, lt: endExclusive } },
      select: { createdAt: true }
    }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: start, lt: endExclusive } },
      select: { createdAt: true }
    }),
    prisma.receiptLineItem.findMany({
      where: { createdAt: { gte: start, lt: endExclusive } },
      select: { createdAt: true, transactionId: true }
    })
  ]);

  for (const l of logins) {
    const bucket = buckets.get(dayKey(l.createdAt));
    if (bucket) bucket.logins++;
  }
  for (const t of transactions) {
    const bucket = buckets.get(dayKey(t.createdAt));
    if (bucket) bucket.transactions++;
  }

  // Distinct by transactionId PER DAY, so a multi-line receipt only counts once.
  const seenPerDay = new Map<string, Set<string>>();
  for (const r of receiptRows) {
    const key = dayKey(r.createdAt);
    let seen = seenPerDay.get(key);
    if (!seen) {
      seen = new Set();
      seenPerDay.set(key, seen);
    }
    if (seen.has(r.transactionId)) continue;
    seen.add(r.transactionId);
    const bucket = buckets.get(key);
    if (bucket) bucket.receiptScans++;
  }

  const series = Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, bucket]) => ({ date, ...bucket }));

  return NextResponse.json({ days, from: start.toISOString(), to: endExclusive.toISOString(), series });
}
