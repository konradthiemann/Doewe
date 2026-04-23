# Datenanalyse: Befunde und Verbesserungsvorschläge

Analysiert am 2026-04-23 anhand von Code-Review der Analytics-Routen und des Datenmodells.

---

## 1. Performance-Probleme in den Analytics-Routen

### 1.1 Unbegrenzte Transaktions-Abfragen für Kontostand-Berechnungen

**Fundort:** [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts)

**Problem:** `totalBalance` und `carryoverFromLastMonth` werden durch `findMany()` auf allen Transaktionen berechnet:

```typescript
// Holt ALLE Transaktionen aller Zeiten — wird mit der Zeit sehr langsam
const allTransactions = await prisma.transaction.findMany({
  where: { accountId },
  select: { amountCents: true }
});
let totalBalanceCents = 0;
for (const t of allTransactions) {
  totalBalanceCents += t.amountCents;
}
```

**Empfehlung:** Prisma-Aggregation verwenden — die Summe berechnet die Datenbank in einem einzigen Query:

```typescript
const result = await prisma.transaction.aggregate({
  where: { accountId },
  _sum: { amountCents: true }
});
const totalBalanceCents = result._sum.amountCents ?? 0;
```

**Gleiche Optimierung** für `transactionsBeforeThisMonth` (carryover) und `prevSavings` (baseline savings).

---

### 1.2 O(n²)-Problem im Quarterly-Endpunkt

**Fundort:** [apps/web/app/api/analytics/quarterly/route.ts](../apps/web/app/api/analytics/quarterly/route.ts)

**Problem:** Für jeden der 3 Monate wird eine eigene Abfrage ausgeführt, die **alle Transaktionen bis zum Monatsende** lädt — um den kumulierten Kontostand zu berechnen:

```typescript
// Für JEDEN Monat eine separate Abfrage über alle historischen Transaktionen
const allTxsUpToEnd = await prisma.transaction.findMany({
  where: { accountId, occurredAt: { lt: end } },
  select: { amountCents: true }
});
```

Bei 3 Monaten bedeutet das: 3 separate DB-Abfragen, jede über potenziell Hunderte von Transaktionen. Diese wachsen mit der Datenmenge.

**Empfehlung:** Alle Transaktionen in einem einzigen Query laden und im Speicher aggregieren:

```typescript
// Eine Abfrage für alle benötigten Daten
const allTxs = await prisma.transaction.findMany({
  where: { accountId, occurredAt: { lt: threeMonthsEnd } },
  select: { amountCents: true, categoryId: true, occurredAt: true },
  orderBy: { occurredAt: 'asc' }
});

// Dann im Speicher nach Monat gruppieren und kumulativen Saldo berechnen
```

Oder alternativ: `balanceCents` als Summe über `_sum`-Aggregate berechnen.

---

## 2. Inkonsistente Erkennung der Spar-Kategorie

**Fundort:**
- [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts): case-insensitive (`"savings"`, `"sparen"`)
- [apps/web/app/api/analytics/quarterly/route.ts](../apps/web/app/api/analytics/quarterly/route.ts): case-sensitive, nur `"Savings"` (exakt)

**Problem:** Die beiden Routen erkennen die Spar-Kategorie unterschiedlich. Im quarterly-Endpunkt wird `"sparen"` (DE) oder `"savings"` (lowercase) nicht erkannt.

**Empfehlung A (kurzfristig):** Gleiche case-insensitive Logik in quarterly anwenden:

```typescript
const SAVINGS_NAMES = ["savings", "sparen"];
const savingsCategory = await prisma.category.findFirst({
  where: {
    userId: user.id,
    name: { in: SAVINGS_NAMES, mode: 'insensitive' }
  },
  select: { id: true }
});
```

**Empfehlung B (langfristig, breaking change):** Ein `isSavings: Boolean`-Feld auf `Category` einführen, statt fragiler Name-Erkennung. Eine Migration ist nötig, aber danach ist die Logik explizit und mehrsprachig.

```prisma
model Category {
  // ...
  isSavings Boolean @default(false)
}
```

---

## 3. Floating-Point-Arithmetik in der Präsentationsschicht

**Fundort:** Beide Analytics-Routen

**Problem:** Alle Berechnungen verwenden `/100` für die Konvertierung von Cents zu Euro — das ist eine Floating-Point-Division:

```typescript
const amt = t.amountCents / 100;  // kann zu 0.30000000000000004 führen
outcomeTotalExclSavings += abs;
```

Bei Aggregationen über viele Transaktionen können sich kleine Fehler summieren.

**Empfehlung:** Alle Aggregationen in Integer-Cents durchführen. Erst am Ende für die JSON-Antwort durch 100 teilen — oder besser: Cents direkt zurückgeben und in der UI konvertieren (wie der quarterly-Endpunkt es bereits teilweise macht: `incomeCents`, `outcomeCents`, etc.).

Der summary-Endpunkt mischt beide Ansätze (manche Felder in Euro, manche in Cents). Vereinheitlichen auf Cents-basierte Rückgabe ist sauberer.

---

## 4. Kein echtes Multi-Account-Support

**Fundort:** Beide Analytics-Routen

**Problem:** Beide Routen holen immer nur den **ersten** Account des Nutzers:

```typescript
const account = await prisma.account.findFirst({
  where: { userId: user.id },
  orderBy: { createdAt: "asc" }
});
```

Das bedeutet: Hat ein Nutzer mehrere Konten (z.B. Girokonto + Sparkonto), werden nur Transaktionen des ersten Kontos im Dashboard angezeigt.

**Empfehlung:** Entscheidung treffen:
- **Option A:** Multi-Account aggregieren (alle Konten zusammen) — erfordert, dass der Analytics-Query über alle Account-IDs des Nutzers arbeitet
- **Option B:** Account-Selektor im Dashboard einführen — Nutzer wählt, welches Konto angezeigt wird
- **Option C (status quo dokumentieren):** Im Code explizit kommentieren, dass aktuell nur das erste Konto angezeigt wird, als bekannte Einschränkung

---

## 5. Spar-Kategorie: Transaktionen mit negativem Betrag

**Fundort:** [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts)

**Problem:** Sparbuchungen werden als negative Ausgaben erwartet:

```typescript
if (amt < 0) baselineSavings += -amt; // accumulate only transfers to savings
```

Aber die Logik ist still: Positive Transaktionen auf die Spar-Kategorie (z.B. Zinsgutschrift ins Sparkonto) werden nicht als Spar-Rückfluss behandelt, sondern als normales Einkommen gewertet. Das kann zu falschen Spar-Summen führen.

**Empfehlung:** Dokumentieren oder explizit validieren, dass Sparbuchungen immer negativ sein müssen.

---

## 6. Fehlende Datums-Validierung bei Recurring-Transaction-Berechnung

**Fundort:** [apps/web/app/api/analytics/summary/route.ts](../apps/web/app/api/analytics/summary/route.ts), Funktion `recurringThisMonth`

**Problem:** Die Filterlogik für wiederkehrende Transaktionen prüft, ob `nextOccurrence` im aktuellen Monat liegt — aber nur anhand von Jahr/Monat-Vergleich, nicht ob der berechnete Tag im Monat tatsächlich gültig ist:

```typescript
const monthsSinceNext = (year - nextYear) * 12 + (month - nextMonth);
return monthsSinceNext >= 0 && monthsSinceNext % interval === 0;
```

Das ist korrekt für die Monatserkennung. Aber wenn `nextOccurrence` in der Zukunft liegt (z.B. weil die Dauerauftrag erst nächsten Monat startet), werden Monate davor fälschlicherweise einbezogen wenn `monthsSinceNext < 0` wäre — was der `>= 0` Check verhindert. ✅ Diese Logik ist eigentlich korrekt.

*Kein Problem, nur als Hinweis dokumentiert.*

---

## Zusammenfassung: Prioritäten

| # | Problem | Priorität | Aufwand |
|---|---|---|---|
| 1 | `findMany` statt `_sum` für Kontostand | **Hoch** — wird mit Datenmenge langsamer | Klein |
| 2 | O(n²) Quarterly-Balance-Query | **Hoch** — 3 Vollscans pro Request | Mittel |
| 3 | Inkonsistente Spar-Kategorie-Erkennung | **Mittel** — Bugrisiko beim DE-Nutzer | Klein |
| 4 | Float-Arithmetik in Aggregationen | **Mittel** — numerische Drift bei vielen Buchungen | Mittel |
| 5 | Kein Multi-Account | **Niedrig** — bekannte Einschränkung | Groß |
| 6 | Spar-Transaktionen positiver Betrag | **Niedrig** — edge case | Klein |
