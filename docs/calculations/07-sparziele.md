# Sparpläne und Sparziele

**Quelle:** `apps/web/app/api/saving-plan/route.ts`, `apps/web/app/api/saving-plan/[id]/route.ts`,
`apps/web/app/api/saving-plan/[id]/complete/route.ts`, `apps/web/app/api/saving-plan/[id]/payments/route.ts`,
`apps/web/app/api/saving-plan/[id]/payments/[paymentId]/route.ts`, `apps/web/app/api/saving-plan/withdraw/route.ts`,
`apps/web/app/api/saving-plan/compute.ts` (Plan-Summen), `apps/web/lib/savingGoalProgress.ts` (Vorschlag, Ausgaben je Ziel)
**Endpoints:** `GET/POST /api/saving-plan`, `GET/PATCH/DELETE /api/saving-plan/[id]`,
`POST/DELETE /api/saving-plan/[id]/complete`, `POST /api/saving-plan/[id]/payments`,
`DELETE /api/saving-plan/[id]/payments/[paymentId]`, `POST /api/saving-plan/withdraw`

Stand: 20. November 2026

Was eine Spar-Kategorie ist und dass der Haushalt der Mandant ist, steht in
[00-grundregeln.md](./00-grundregeln.md) §2 und §3. „Laufender Monat" ist der Berliner Kalendermonat
(§1).

## Grundsatz: kein Spar-Bestand

Doewe bildet das Monatsbudget ab. Eine Buchung in einer Spar-Kategorie ist Geld, das den Monat
verlässt: Es steht in diesem Monat nicht mehr zur Verfügung („Gespart", Grundregeln §2). Was danach
auf dem Sparkonto liegt, liegt **außerhalb der App**. Doewe führt deshalb keinen Spartopf und zeigt
keinen Bestand — sonst müsste jedes Sparkonto mit Anfangsbestand, Zinsen und direkten Abbuchungen
gepflegt werden.

Ein Sparziel ist damit zweierlei:

- ein **Plan**: Zielbetrag, Termin und eine Monatsrate, die der Haushalt selbst festlegt,
- ein **Projektbudget**: was für das Ziel ausgegeben wurde, aus dem Monatsbudget (verknüpfte
  Buchungen) und aus dem Ersparten (Zahlungen, die am Ziel eingetragen werden).

## Datenmodell

Sparziele verwenden das **Budget-Modell** mit `categoryId = null`:

```
Budget (als Sparziel)
├── categoryId       = null    — unterscheidet Sparziel von Kategorie-Budget
├── title                      — Pflichtfeld (z.B. "Urlaub 2027")
├── month            = Zielmonat (1-12); null = ohne Termin
├── year             = Zieljahr; null = ohne Termin (Monat und Jahr nur gemeinsam)
├── amountCents                — Zielbetrag in Cents (mind. 1); null = noch kein Betrag
├── monthlyRateCents           — geplante Monatsrate (mind. 0); null = keine Rate.
│                                Nur Ziele mit Termin haben eine
├── completedAt      = null    — null = aktives Ziel, gesetzt = abgeschlossen
├── spentCents       = null    — Kosten, beim Abschluss festgehalten: verknüpfte Buchungen
│                                plus Zahlungen aus dem Ersparten; null solange aktiv
├── withdrawalTransactionId    — nur Altbestand (siehe unten), sonst null
└── reservedCents              — nur Altbestand, wird nicht mehr gelesen

SavingGoalPayment (Zahlung aus dem Ersparten)
├── goalId                     — das Ziel (Löschen des Ziels löscht sie mit)
├── amountCents                — Betrag in Cents (mind. 1)
├── occurredAt                 — Tag der Zahlung, gespeichert als 12:00 Uhr Berliner Zeit
├── note                       — optional, höchstens 200 Zeichen
└── createdByUserId            — wer sie eingetragen hat
```

Eine `SavingGoalPayment` ist **keine Buchung**: Sie ändert keinen Kontostand, keine Monatszahl, kein
Budget und keine Auswertung. Sie zählt nur bei dem Ziel, an dem sie steht.

Drei Zustände, in der GET-Response getrennt geliefert:

| Liste | Bedingung | Rolle |
|---|---|---|
| `goals` | `completedAt == null`, Monat und Jahr gesetzt | aktive Ziele mit Termin — nur sie gehen in die Plan-Summen ein |
| `undatedGoals` | `completedAt == null`, ohne Termin | Ideen-Liste; keine Rate, nicht in der geplanten Summe |
| `completedGoals` | `completedAt` gesetzt | abgeschlossen, mit festgehaltenen Kosten |

Die Sparplan-Routen arbeiten nur mit `Budget`-Zeilen **ohne** Kategorie, gelesen über alle Konten des
Haushalts. Ein Kategorie-Budget ist hier kein Ziel: `GET` listet es nicht, die Routen unter `[id]`
antworten dafür mit `404`. Dasselbe gilt für ein gelöschtes Ziel (`deletedAt` gesetzt).

## Was für ein Ziel ausgegeben wurde

### Aus dem Monatsbudget (transactionSpentCents)

```typescript
// compute.ts
export function linkedSpentCents(rows, savingsIds) {
  const { outcomeCents, incomeCents } = sumFlows(rows, savingsIds);
  return Math.max(outcomeCents - incomeCents, 0);
}
```

- `rows` = alle **nicht gelöschten** Buchungen mit `savingGoalId = goal.id`
- Eingeordnet wird wie überall mit `classifyFlow` (Grundregeln §2): Ausgaben der verknüpften
  Buchungen **minus** verknüpfte Erstattungen, mindestens 0
- Verknüpfte Buchungen einer Spar-Kategorie zählen nicht — Sparen ist keine Ausgabe für das Ziel
- Verknüpfen lassen sich alle offenen Ziele, mit und ohne Termin (Buchungsformular „Sparziel
  verknüpfen")

### Aus dem Ersparten (savingsPaidCents)

`savingsPaidCents` = Summe der `SavingGoalPayment.amountCents` des Ziels. Typischer Fall: Hotel und
Flug werden direkt vom Sparkonto bezahlt. Würde man das als Ausgabe buchen, sänke „Verfügbar bis
Monatsende", obwohl das Geld nie aus dem Monatsbudget kam — eine Scheinausgabe.

### Anzeige

`goalSpending(transactionSpentCents, savingsPaidCents, amountCents)` in `lib/savingGoalProgress.ts`:

| Wert | Rechnung |
|---|---|
| `spentCents` | `transactionSpentCents + savingsPaidCents` |
| `remainingCents` | `max(amountCents − spentCents, 0)`; 0 ohne Zielbetrag |
| `overCents` | `max(spentCents − amountCents, 0)` |
| `percent` | `goalPercent(spentCents, amountCents)` — kaufmännisch gerundet, 100 erst bei vollem Betrag; 0 ohne Zielbetrag |

**Beispiel:** Urlaub, Ziel 2.000 €. Hotel und Flug vom Sparkonto: 1.500 € aus dem Ersparten. Essen
vor Ort, mit dem Ziel verknüpft: 300 € aus dem Monatsbudget. Ausgegeben 1.800 €, noch 200 € übrig,
90 %.

## Monatsrate

### Rate je Ziel (monthlyRateCents)

Die Rate legt der Haushalt fest. Doewe schlägt vor:

```
monthsToDeadline = max((zielJahr − jahr) × 12 + (zielMonat − monat), 1)   // Berliner Monat von now
suggestedMonthlyRateCents = ceil(amountCents / monthsToDeadline)          // null ohne Betrag oder Termin
```

Der laufende Monat zählt mit, der Zielmonat nicht: Das Geld wird **zum** Termin gebraucht. Ziel
1.200 € bis Januar, heute November → November und Dezember → 600 € pro Monat.

Der Vorschlag weiß nicht, was schon auf dem Sparkonto liegt. Deshalb ist er nur ein Vorschlag:
Beim Anlegen füllt das Formular ihn ein, solange niemand die Rate selbst ändert; an einem Ziel ohne
Rate bietet die Karte „Übernehmen" an. Liegt das Geld schon bereit, trägt man 0 ein.

- Eine Rate gibt es nur mit Termin. `POST` und `PATCH` speichern für ein Ziel ohne Termin keine;
  wird der Termin entfernt, wird die Rate geleert.
- `0` ist eine gültige Rate, `null` heißt „keine Rate".

### Plan-Summen (totals)

`computeSavingPlanTotals(goals, now)` in `compute.ts`:

```
totalTargetCents = Σ amountCents   der aktiven Ziele mit Termin
monthlyRateCents = Σ monthlyRateCents der aktiven Ziele mit Termin,
                   deren Zielmonat der laufende Berliner Monat oder später ist
```

Ein Ziel, dessen Termin vorbei ist, verlangt keine Monatsrate mehr; sein Zielbetrag bleibt in der
geplanten Summe, bis es abgeschlossen wird. Ziele ohne Termin und abgeschlossene Ziele zählen
nirgends.

Das Dashboard vergleicht „Diesen Monat gespart" mit `monthlyRateCents` (Karte „Sparübersicht").

## Abschließen und wieder öffnen

### Abschließen — `POST /api/saving-plan/[id]/complete`

- **Body (Zod), alles optional, auch ohne Body:**
  ```typescript
  { savingsPayment?: { amountCents: number, day?: "JJJJ-MM-TT", note?: string } | null }
  ```
  `savingsPayment` ist eine letzte Zahlung aus dem Ersparten, im selben Schritt eingetragen.
- **Wirkung, in einer Datenbank-Transaktion:** `completedAt = now`, die Zahlung wird angelegt,
  `spentCents = transactionSpentCents + savingsPaidCents` (mit der neuen Zahlung).
- **Es wird nichts gebucht.** Keine Entnahme, kein Kauf.
- **Guards:** `401` ohne Session, `404` (unbekannt, Kategorie-Budget, gelöscht), `403` fremder
  Haushalt, `400` ungültiger Body, `409` schon abgeschlossen. Zwei gleichzeitige Abschlüsse: genau
  einer geht durch, der andere bekommt `409` und legt keine Zahlung an.
- **Response:** die aktualisierte `Budget`-Zeile.

`spentCents` ist ein Schnappschuss: Wird danach eine verknüpfte Buchung geändert oder gelöscht,
bleibt der Wert, bis das Ziel wieder geöffnet und erneut abgeschlossen wird.

### Wieder öffnen — `DELETE /api/saving-plan/[id]/complete`

- `completedAt`, `spentCents`, `withdrawalTransactionId` und `reservedCents` werden geleert; die
  Zahlungen aus dem Ersparten bleiben am Ziel.
- **Altbestand:** Ziele, die ab dem 19. November 2026 bis zu diesem Umbau abgeschlossen wurden, haben
  beim Abschluss eine Entnahme gebucht (`withdrawalTransactionId`). Beim Wiederöffnen wird diese
  Buchung gelöscht (`deletedAt`), wie bisher. Hat der Nutzer sie schon selbst gelöscht, passiert
  nichts weiter.

### Zahlungen nur an offenen Zielen

`POST …/payments` und `DELETE …/payments/[paymentId]` antworten für ein abgeschlossenes Ziel mit
`409`. Wer nachträglich etwas ändern will, öffnet das Ziel wieder.

## Zahlung aus dem Ersparten — `POST /api/saving-plan/[id]/payments`

- **Body:** `{ amountCents, day?, note? }` — `amountCents` ganze Zahl von 1 bis int4; `day` ein
  Berliner Kalendertag `JJJJ-MM-TT`, Standard heute; `note` höchstens 200 Zeichen, ohne Leerraum am
  Rand gespeichert, leer = keine Notiz
- **Datum:** 12:00 Uhr Berliner Zeit des Tages (Grundregeln §1)
- **Response `201`:** `{ id, goalId, amountCents, occurredAt, note }`
- **Guards:** `400`, `401`, `403`, `404`, `409` (abgeschlossen)

`DELETE /api/saving-plan/[id]/payments/[paymentId]` entfernt eine Zahlung endgültig (sie war nie eine
Buchung). `404`, wenn sie nicht zu diesem Ziel gehört.

## Erspartes ins Monatsbudget holen — `POST /api/saving-plan/withdraw`

Für Geld, das vom Sparkonto zurück aufs Girokonto geht und im Alltag ausgegeben wird, z. B. für eine
Reparatur: eine **positive** Buchung in einer Spar-Kategorie. Die Auswertungen ordnen sie als Sparen
ein (Grundregeln §2) — sie verringert „Gespart" des Monats, erhöht „Verfügbar bis Monatsende" und ist
keine Einnahme.

- **Body:** `{ amountCents, accountId?, description? }` — `amountCents` ganze Zahl von 1 bis int4;
  `accountId` Standard: das älteste Konto des Haushalts; `description` Standard `"Savings withdrawal"`
- **Keine Obergrenze:** Doewe kennt den Bestand des Sparkontos nicht.
- **Kategorie:** Bei mehreren Spar-Kategorien geht die Buchung in die älteste
  (`findSavingsBookingCategoryId`). Gibt es keine: `409`
- **Datum:** `occurredAt` ist der Zeitpunkt der Anfrage
- **Response `201`:** `{ id, amountCents }`

Für ein Sparziel, das vom Sparkonto bezahlt wird, ist das nicht nötig: Dort trägt man „Aus Erspartem
bezahlt" ein.

## API-Besonderheit: flexible Feldnamen

Die POST- und PATCH-Endpunkte akzeptieren mehrere Feldnamen für Monat/Jahr:

```typescript
// POST: targetMonth, month, dueMonth (und targetYear, year, dueYear)
targetMonth: json?.targetMonth ?? json?.month ?? json?.dueMonth

// PATCH: targetMonth, month — ein ausdrückliches null bleibt erhalten (entfernt den Termin)
targetMonth: json?.targetMonth !== undefined ? json.targetMonth : json?.month
```

Monat und Jahr müssen immer gemeinsam gesetzt oder gemeinsam weggelassen bzw. auf `null` gesetzt
werden, sonst `400`. Ein Titel nur aus Leerraum und ein Betrag über dem int4-Bereich sind ebenfalls
`400`.

## Titel

Der Titel ist beim Anlegen Pflicht und wird ohne Leerraum am Rand gespeichert. `normalizeTitle` in
`route.ts` ist nur noch ein Fallback für alte Zeilen mit leerem Titel: Sie zeigt dann `JJJJ-MM` des
Termins, bei Zielen ohne Termin einen leeren Text.

## GET /api/saving-plan — Response

```typescript
{
  goals: [                              // aktive Ziele MIT Termin, sortiert nach Termin
    {
      id: string,
      accountId: string,
      categoryId: null,
      categoryName: null,
      title: string,
      month: number,
      year: number,
      amountCents: number | null,
      monthlyRateCents: number | null,           // geplante Rate, null = keine
      suggestedMonthlyRateCents: number | null,  // Vorschlag, null ohne Betrag
      transactionSpentCents: number,             // aus dem Monatsbudget
      savingsPaidCents: number,                  // aus dem Ersparten
      savingsPayments: [ { id, amountCents, occurredAt, note } ],  // neueste zuerst
      completedAt: null,
      spentCents: null,
      createdAt: DateTime
    }
  ],
  undatedGoals: [ /* aktive Ziele OHNE Termin, gleiche Felder; month, year,
                     monthlyRateCents und suggestedMonthlyRateCents sind null */ ],
  completedGoals: [ /* abgeschlossene Ziele, gleiche Felder; completedAt und spentCents gesetzt */ ],
  totals: {
    totalTargetCents: number,   // Zielbeträge der aktiven Ziele mit Termin
    monthlyRateCents: number    // Raten der aktiven Ziele, deren Termin noch kommt
  }
}
```

`404`, wenn der Haushalt kein Konto hat.

## Auswirkungen auf andere Endpunkte

- `GET /api/analytics/summary` liefert `completedGoals` (im **laufenden** Monat abgeschlossene Ziele,
  je `{ title, target, spent, completedAt }`, Euro) und `completedGoalsSpent` (Summe der Kosten).
- `GET /api/analytics/monthly-review` liefert `completedGoals[]` (im abgefragten Monat abgeschlossene
  Ziele, je `{ title, amountCents, spentCents }`) und `completedGoalsSpentCents`.

In beiden Fällen entscheidet der Berliner Monat von `completedAt` (Grundregeln §1). Zahlungen aus dem
Ersparten erscheinen in keiner Monatszahl; `apps/web/tests/reconciliation.test.ts` prüft, dass eine
neue Zahlung weder Rückblick noch Dashboard, Buchungsliste oder Quartalsübersicht verändert.

## Geschichte

- Bis zum 19. November 2026 hielten abgeschlossene Ziele ihren Betrag rechnerisch im Spartopf zurück
  (`reservedCents`).
- Ab dem 19. November 2026 buchte der Abschluss eine Entnahme aus dem Spartopf und auf Wunsch den Kauf
  als Ausgabe.
- Mit dem Umbau vom 20. November 2026 (Migration `20261120120000_saving_goal_payments_rate`) gibt es
  keinen Spartopf mehr. Bestehende Entnahme-Buchungen bleiben als
  echte Buchungen stehen; `reservedCents` wird nicht mehr gelesen.
