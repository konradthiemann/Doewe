/**
 * GET  /api/transactions  — Alle Transaktionen des eingeloggten Nutzers (neueste zuerst)
 * POST /api/transactions  — Neue Transaktion anlegen
 *
 * Authentifizierung: Pflicht. Gibt 401 zurück wenn nicht eingeloggt.
 * Autorisierung: Nur Transaktionen des eigenen Haushalts (via accountId → householdId).
 *
 * POST Body (JSON):
 *   accountId    string   — Pflicht, muss zum Haushalt gehören
 *   amountCents  number   — Ganzzahl im int4-Bereich, positiv = Einnahme, negativ = Ausgabe
 *   description  string   — Pflicht, nicht leer (Leerraum am Rand wird entfernt)
 *   occurredAt   string   — ISO-Zeitpunkt, oder ein Kalendertag `yyyy-mm-dd`
 *                           (wird als 12:00 Uhr Europe/Berlin dieses Tages gespeichert)
 *   categoryId?  string   — Optional, muss zum Haushalt gehören
 *   savingGoalId? string  — Optional, verknüpft mit einem Budget-Ziel
 *   taxRelevant? boolean  — Optional, für die Steuererklärung vorgemerkt.
 *                           Default: isTaxRelevant der Kategorie, sonst false.
 *
 * Ungültige Eingaben (auch: kein JSON, Beschreibung nur aus Leerraum, Betrag
 * außerhalb int4, ungültiges Datum) liefern 400 — nie 500: die Offline-Outbox
 * hält bei jedem 5xx an und würde alle späteren Buchungen blockieren.
 */
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "../../../lib/auth";
import { checkBudgetAlerts } from "../../../lib/budgetAlerts";
import { prisma } from "../../../lib/prisma";

import { parseOccurredAt, TransactionInput } from "./schema";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.transaction.findMany({
    where: { account: { householdId: user.householdId } },
    orderBy: { occurredAt: "desc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Idempotenz (Offline-Outbox, Phase 3a): Replays mit bekannter mutationId
  // geben die gespeicherte Antwort zurück, statt doppelt zu buchen.
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const replay = await prisma.mutationLog.findUnique({ where: { mutationId: idempotencyKey } });
    if (replay && replay.userId === user.id) {
      return NextResponse.json(replay.responseBody, { status: replay.responseStatus });
    }
  }

  // Kein gültiges JSON → null → scheitert an der Validierung (400 statt 500).
  const json: unknown = await req.json().catch(() => null);
  const parsed = TransactionInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  // Das Schema hat das Datum bereits geprüft; der Guard hält nur den Typ eng.
  const occurredAt = parseOccurredAt(data.occurredAt);
  if (!occurredAt) {
    return NextResponse.json({ error: "Invalid occurredAt" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({ where: { id: data.accountId, householdId: user.householdId } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  let category: { isTaxRelevant: boolean } | null = null;
  if (data.categoryId) {
    category = await prisma.category.findFirst({ where: { id: data.categoryId, householdId: user.householdId } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
  }

  if (data.savingGoalId) {
    const goal = await prisma.budget.findFirst({ where: { id: data.savingGoalId, account: { householdId: user.householdId } } });
    if (!goal) {
      return NextResponse.json({ error: "Saving goal not found" }, { status: 404 });
    }
  }

  try {
    // Anlegen + Idempotenz-Log atomar: entweder beides oder nichts.
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.transaction.create({
        data: {
          // Client-ID (Offline-Erfassung) übernehmen, sonst Server-cuid
          ...(data.id ? { id: data.id } : {}),
          accountId: data.accountId,
          categoryId: data.categoryId ?? null,
          savingGoalId: data.savingGoalId ?? null,
          // Provenienz für das "von {Name}"-Badge im Haushalt (Teil D)
          createdByUserId: user.id,
          amountCents: data.amountCents,
          description: data.description,
          occurredAt,
          // Ohne explizites Flag erbt die Transaktion die Steuer-Markierung der
          // Kategorie — so greifen auch API-Clients ohne Formular (z. B. Importe).
          taxRelevant: data.taxRelevant ?? category?.isTaxRelevant ?? false
        }
      });

      if (idempotencyKey) {
        await tx.mutationLog.create({
          data: {
            mutationId: idempotencyKey,
            userId: user.id,
            entity: "transaction",
            responseStatus: 201,
            // Wie die JSON-Antwort serialisieren (Dates → ISO-Strings)
            responseBody: JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue
          }
        });
      }

      return row;
    });

    // Budget-Warnung (Teil C): Nach dem Commit prüfen, ob eine Kategorie-Budget-
    // Schwelle erreicht wurde, und ggf. einen Push an den Haushalt senden. Bewusst
    // awaited (auf Serverless enden Handler sonst vor dem Versand); alle Fehler
    // werden intern geschluckt, die Buchung darf nie an einem Push-Problem scheitern.
    await checkBudgetAlerts({
      householdId: user.householdId,
      categoryId: created.categoryId,
      occurredAt: created.occurredAt
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Zwei parallele Replays derselben mutationId: der Verlierer liest die
      // vom Gewinner gespeicherte Antwort.
      if (idempotencyKey) {
        const replay = await prisma.mutationLog.findUnique({ where: { mutationId: idempotencyKey } });
        if (replay && replay.userId === user.id) {
          return NextResponse.json(replay.responseBody, { status: replay.responseStatus });
        }
      }
      // Sonst: Client-ID kollidiert mit einer bestehenden Transaktion.
      return NextResponse.json({ error: "Duplicate transaction id" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Invalid account or category reference" }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
