# Datenanalyse: Befunde und Verbesserungsvorschläge

Analysiert am 2026-04-23 anhand von Code-Review der Analytics-Routen und des Datenmodells.
Umgesetzt am 2026-04-23.

---

## 1. Performance-Probleme in den Analytics-Routen

### 1.1 `findMany` → `aggregate` für Kontostand-Berechnungen ✅ Umgesetzt

**Fundort:** [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts)

**Problem (vorher):** `totalBalance` und `carryoverFromLastMonth` wurden durch `findMany()` auf allen Transaktionen berechnet — die DB lieferte alle Datensätze, die App summierte sie in einem Loop:

```typescript
// Vorher: holt ALLE Transaktionen — wird mit der Zeit sehr langsam
const allTransactions = await prisma.transaction.findMany({
  where: { accountId },
  select: { amountCents: true }
});
let totalBalanceCents = 0;
for (const t of allTransactions) {
  totalBalanceCents += t.amountCents;
}
```

**Umsetzung:** Prisma-Aggregation — die Datenbank berechnet die Summe in einem einzigen Query, kein Datentransfer:

```typescript
// apps/web/app/api/analytics/summary/route.ts — Zeile 57
const totalBalanceAgg = await prisma.transaction.aggregate({
  where: { accountId },
  _sum: { amountCents: true }
});
const totalBalance = (totalBalanceAgg._sum.amountCents ?? 0) / 100;

// Zeile 62 — gleiche Optimierung für carryover
const carryoverAgg = await prisma.transaction.aggregate({
  where: { accountId, occurredAt: { lt: start } },
  _sum: { amountCents: true }
});
const carryoverFromLastMonth = (carryoverAgg._sum.amountCents ?? 0) / 100;
```

Gleiches Muster für `prevSavings` (baseline savings, Zeile 167):

```typescript
// Zeile 167 — nur negative Buchungen zählen als Spareinzahlungen
const prevSavingsAgg = await prisma.transaction.aggregate({
  where: {
    accountId,
    categoryId: savingsCatId,
    occurredAt: { lt: start },
    amountCents: { lt: 0 }
  },
  _sum: { amountCents: true }
});
baselineSavingsCents = -(prevSavingsAgg._sum.amountCents ?? 0);
```

---

### 1.2 O(n²) im Quarterly-Endpunkt beseitigt ✅ Umgesetzt

**Fundort:** [apps/web/app/api/analytics/quarterly/route.ts](../apps/web/app/api/analytics/quarterly/route.ts)

**Problem (vorher):** Für jeden der 3 Monate wurde eine eigene Abfrage ausgeführt, die alle historischen Transaktionen bis zum Monatsende lud — 3 DB-Abfragen, jede über potenziell Hunderte von Transaktionen:

```typescript
// Vorher: 3× separater Vollscan
const allTxsUpToEnd = await prisma.transaction.findMany({
  where: { accountId, occurredAt: { lt: end } },
  select: { amountCents: true }
});
let balance = 0;
for (const t of allTxsUpToEnd) { balance += t.amountCents; }
```

**Umsetzung:** Alle Transaktionen in einer einzigen Abfrage laden, danach im Speicher aggregieren:

```typescript
// apps/web/app/api/analytics/quarterly/route.ts — Zeile 44
// Eine Abfrage für alle benötigten Daten — ersetzt 3 separate findMany-Aufrufe
const allTxs = await prisma.transaction.findMany({
  where: { accountId, occurredAt: { lt: overallEnd } },
  select: { amountCents: true, categoryId: true, occurredAt: true }
});

// Zeile 52 — In-Memory-Aggregation pro Monat, keine weiteren DB-Abfragen
const quarters = months.map(({ month, year }, i) => {
  const startMs = starts[i].getTime();
  const endMs = ends[i].getTime();

  let income = 0, outcome = 0, savings = 0, balance = 0;

  for (const t of allTxs) {
    const tMs = t.occurredAt.getTime();
    if (tMs < endMs) balance += t.amountCents; // kumulativer Kontostand
    if (tMs >= startMs && tMs < endMs) {
      // Einnahmen/Ausgaben/Sparen dieses Monats
      ...
    }
  }
  return { month, year, incomeCents: income, outcomeCents: outcome, savingsCents: savings, balanceCents: balance };
});
```

Ergebnis: Von 6 DB-Abfragen (3 für Monatstransaktionen + 3 für Kontostand) auf **1 DB-Abfrage** reduziert.

---

## 2. Inkonsistente Erkennung der Spar-Kategorie ✅ Umgesetzt

**Fundort:**
- [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts): war bereits case-insensitive
- [apps/web/app/api/analytics/quarterly/route.ts](../apps/web/app/api/analytics/quarterly/route.ts): war case-sensitive, nur `"Savings"` (exakt)

**Problem (vorher):** Im quarterly-Endpunkt wurde `"sparen"` (DE) oder `"savings"` (lowercase) nicht erkannt:

```typescript
// Vorher: case-sensitive, nur exaktes "Savings"
const savingsCategory = await prisma.category.findFirst({
  where: { name: "Savings", userId: user.id },
  select: { id: true }
});
```

**Umsetzung:** Gleiche case-insensitive Logik wie in summary, mit Prisma `mode: "insensitive"`:

```typescript
// apps/web/app/api/analytics/quarterly/route.ts — Zeile 30
const SAVINGS_NAMES = ["savings", "sparen"];
const savingsCategory = await prisma.category.findFirst({
  where: {
    userId: user.id,
    name: { in: SAVINGS_NAMES, mode: "insensitive" }
  },
  select: { id: true }
});
```

Beide Routen verwenden jetzt exakt dieselbe Erkennungslogik.

---

## 3. Floating-Point-Arithmetik in der Präsentationsschicht ✅ Umgesetzt

**Fundort:** [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts)

**Problem (vorher):** Alle Aggregationen teilten früh durch 100 und akkumulierten Float-Werte:

```typescript
// Vorher: Float-Division in der Inner Loop — kann zu 0.30000000000000004 führen
const amt = t.amountCents / 100;
outcomeTotalExclSavings += abs; // Float-Akkumulation
```

**Umsetzung:** Alle Berechnungen ausschließlich in Integer-Cents, Division durch 100 erst bei der JSON-Antwort:

```typescript
// apps/web/app/api/analytics/summary/route.ts — Zeile 84
// Integer-Cents — keine Floating-Point-Drift
let incomeTotalCents = 0;
let outcomeTotalCents = 0;
let monthlySavingsActualCents = 0;
const byCategoryCents: Record<string, number> = {};

for (const t of txs) {
  const amt = t.amountCents; // direkt Integer verwenden
  if (amt >= 0) {
    incomeTotalCents += amt;
  } else { ... }
}

// Zeile 219 — erst im Response durch 100 teilen
return NextResponse.json({
  incomeTotal: incomeTotalCents / 100,
  outcomeTotal: outcomeTotalCents / 100,
  ...
});
```

Das Gleiche gilt für den Tages-Chart (Zeile 122 ff.) und die Dauerauftrags-Berechnung (Zeile 108 ff.): alle Loops in Cents, `/ 100` nur im letzten Schritt.

---

## 4. Kein echtes Multi-Account-Support ⚠️ Dokumentiert (Option C)

**Fundort:** Beide Analytics-Routen

**Status:** Als bekannte Einschränkung im Code dokumentiert. Beide Routen haben nun einen expliziten Kommentar:

```typescript
// apps/web/app/api/analytics/summary/route.ts — Zeile 51
// NOTE: Nur das erste Konto wird verwendet — Multi-Account ist eine bekannte zukünftige Erweiterung.
const account = await prisma.account.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
```

Auch im JSDoc-Block oben in `summary/route.ts` dokumentiert. Technische Umsetzung (Option A: aggregieren oder Option B: Account-Selektor) bleibt künftiger Arbeit vorbehalten.

---

## 5. Spar-Kategorie: Transaktionen mit negativem Betrag ✅ Dokumentiert + Optimiert

**Fundort:** [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts)

**Problem:** Sparbuchungen wurden als negative Ausgaben erwartet, aber positive Transaktionen auf die Spar-Kategorie (z.B. Zinsgutschrift) wurden stillschweigend ignoriert.

**Umsetzung:** Durch den Wechsel zu einem DB-Filter `amountCents: { lt: 0 }` in der `aggregate`-Abfrage für den Baseline-Sparbetrag ist die Logik jetzt explizit und korrekt — und im JSDoc dokumentiert:

```typescript
// apps/web/app/api/analytics/summary/route.ts — Zeile 93
// Sparbuchungen sind per Konvention negativ (Abgang vom Girokonto zum Sparkonto)
monthlySavingsActualCents += abs;

// Zeile 167 — nur negative Buchungen fließen in die Baseline ein
const prevSavingsAgg = await prisma.transaction.aggregate({
  where: {
    ...
    amountCents: { lt: 0 } // nur Einzahlungen, keine Zinsgutschriften o.ä.
  },
  _sum: { amountCents: true }
});
```

---

## 6. Fehlende Datums-Validierung bei Recurring-Transaction-Berechnung

**Fundort:** [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts)

**Befund:** Logik ist korrekt — der `>= 0`-Check verhindert zuverlässig, dass zukünftige Starts fälschlicherweise einbezogen werden.

*Kein Handlungsbedarf.*

---

## Zusammenfassung: Prioritäten

| # | Problem | Priorität | Aufwand | Status |
|---|---|---|---|---|
| 1a | `findMany` → `_sum` für Kontostand (summary) | **Hoch** | Klein | ✅ Umgesetzt |
| 1b | O(n²) Quarterly-Balance-Query | **Hoch** | Mittel | ✅ Umgesetzt |
| 2 | Inkonsistente Spar-Kategorie-Erkennung | **Mittel** | Klein | ✅ Umgesetzt |
| 3 | Float-Arithmetik in Aggregationen | **Mittel** | Mittel | ✅ Umgesetzt |
| 4 | Kein Multi-Account | **Niedrig** | Groß | ⚠️ Dokumentiert |
| 5 | Spar-Transaktionen positiver Betrag | **Niedrig** | Klein | ✅ Dokumentiert + DB-Filter |
| 6 | Datums-Validierung Recurring | — | — | ✅ War korrekt |
