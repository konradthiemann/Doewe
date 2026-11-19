# Budgets — Ziele vs. tatsächliche Ausgaben

**Quellen:**
- `apps/web/app/api/budgets/route.ts`
- `apps/web/app/api/analytics/summary/route.ts` (Budget-Auswertung)
- `apps/web/app/api/analytics/category-year/route.ts`, `packages/shared/src/categoryYear.ts` (Jahresübersicht nach Kategorien)
- `apps/web/app/api/budget-plans/` (Budget-Pläne), `apps/web/lib/categoryBudgets.ts` (effektive Budgets, eingefrorene Monate)
- `packages/shared/src/budgetDistribution.ts` (Verteilung, Auflösung)
- `apps/web/lib/budgetAlerts.ts` (Budget-Warnung per Push)

„Ausgegeben" je Kategorie ist überall dieselbe Zahl — Budgets, Dashboard, Rückblick,
Jahresübersicht, Budget-Warnung ([00-grundregeln.md](./00-grundregeln.md) §6): die als `outcome`
eingeordneten Buchungen der Kategorie im Berliner Kalendermonat, über alle Konten des Haushalts.
Erstattungen mindern sie nicht, Buchungen einer Spar-Kategorie sind keine Ausgaben (§2).

## Was ist ein Budget?

Ein Budget definiert einen **Ziel-Betrag** für eine Kategorie in einem bestimmten Monat.

```
Budget
├── accountId   — Konto
├── categoryId  — Kategorie (null = Sparziel)
├── month       — 1-12 (bei Sparzielen ohne Termin null)
├── year        — (bei Sparzielen ohne Termin null)
├── amountCents — Ziel-Betrag (bei Sparzielen optional)
└── title       — optionaler Titel (Default "")
```

`POST /api/budgets` prüft `amountCents` nur auf Ganzzahligkeit — auch 0 und negative Werte werden
angenommen. Ein Budget `<= 0` wirkt in der Jahresübersicht und in der Budget-Warnung wie kein Budget.

**Unique-Constraint:** `(accountId, categoryId, month, year)` — pro Konto, Kategorie und Monat nur
ein Budget. Für Zeilen ohne Kategorie (`categoryId = null`, Sparziele) greift der Constraint nicht,
weil `NULL`-Werte in einem Unique-Index als verschieden gelten: Ein Konto kann mehrere Sparziele im
selben Monat haben.

## Zwei Budget-Typen

```mermaid
flowchart LR
    B["Budget"] --> CAT{categoryId}
    CAT -->|"nicht null"| CATBUDGET["Kategorie-Budget (Monats-Budget)\n→ Ausgaben-Ziel für eine Kategorie in einem Monat\nz.B. 'Lebensmittel: max 300€ im April'"]
    CAT -->|"null"| SAVBUDGET["Sparziel\n→ siehe 07-sparziele.md"]
```

## Budget-Pläne (CategoryBudgetPlan)

Ein **Plan** ist ein dauerhaftes Budget je Kategorie (höchstens einer pro Kategorie, nicht für Spar- und Einnahmenkategorien):

- `MONTHLY` — `amountCents` gilt in jedem Monat.
- `YEARLY` — `amountCents` ist der Jahresbetrag und wird auf die 12 Monate verteilt.

**Verteilung (YEARLY)**, alles in Integer-Cent, Gewichte `w[i] = max(0, available[i])`, `available` = geglättete Verfügbarkeit (`smoothedAvailablePerMonth`): Jahreseinnahmen der Daueraufträge gleichmäßig `round(income.totalCents / 12)` plus die Fixkosten und Sparraten des jeweiligen Monats (`expenses`/`savings.monthlyTotalsCents[m]`, beide negativ gespeichert):

```
W = Σ w[i]                         (W <= 0 → alle Gewichte 1, also gleichmäßig)
share[i] = floor(yearly * w[i] / W)
Rest r = yearly - Σ share[i]       (0..11 Cent)
→ der komplette Rest geht auf den Monat mit dem größten Gewicht (Gleichstand: kleinster Index)
```

Die Summe der 12 Monatsbeträge ist immer exakt `yearly`; Monate ohne Verfügbarkeit erhalten 0 (außer im Gleichgewichts-Fallback).

**Reihenfolge der effektiven Budgets** (`loadEffectiveCategoryBudgets`, `resolveEffectiveBudgets`):

1. Plan der Kategorie (MONTHLY: Betrag, YEARLY: Anteil des Monats)
2. Ein Monats-`Budget` (Kategorie, Monat, Jahr) überschreibt den Plan **nicht**: der Plan hat Vorrang
3. Ein Monats-`Budget` gilt nur als Fallback für Kategorien **ohne** Plan. Gelesen werden die Zeilen aller Konten des Haushalts; haben mehrere Konten eine Zeile für dieselbe Kategorie und denselben Monat, ist das Budget des Haushalts ihre Summe
4. Kategorien ohne Plan und ohne Monats-Budget haben kein Budget

Pläne von soft-gelöschten Kategorien und soft-gelöschte Pläne werden ignoriert. Die Jahresmatrix wird nur geladen, wenn ein YEARLY-Plan existiert.

**Kategorie zusammenführen/löschen:** Beim Merge (`PATCH /api/categories/:id` mit `mergeIntoCategoryId`) und beim Löschen mit Fallback (`DELETE`, `fallbackCategoryId`/`fallbackName`) folgt der Plan der Quellkategorie in derselben Transaktion: Hat die Zielkategorie keinen aktiven Plan, wird der Quellplan (gleiche `id`) auf das Ziel umgehängt (eine soft-gelöschte Plan-Zeile des Ziels wird vorher hart gelöscht, da `categoryId` unique ist). Hat das Ziel einen aktiven Plan, bleibt dieser unverändert und der Quellplan wird hart gelöscht.
Die eingefrorenen Monate (siehe unten) ziehen mit: Vorher werden die noch nicht eingefrorenen
abgeschlossenen Monate eingefroren (`freezePastMonths`), dann wird in derselben Transaktion in jedem
Snapshot des Haushalts der Betrag der Quelle zu dem des Ziels addiert — oder wird zu dessen Betrag,
wenn das Ziel keinen hatte — und der Eintrag der Quelle entfernt (`mergeFrozenBudgets`). Die
Buchungen der Quelle stehen danach auch in den abgeschlossenen Monaten unter dem Ziel und haben dort
weiter ihr Budget.

**Abgeschlossene Monate sind eingefroren** (`BudgetMonthSnapshot`, je Haushalt, Jahr und Monat eine Zeile; `budgets` ordnet `categoryId` den Cents zu):

Pläne haben keinen Gültigkeitsbeginn und keine Historie, und die Monatsanteile eines `YEARLY`-Plans hängen an den Daueraufträgen des Jahres. Ohne Einfrieren änderte sich das Budget eines längst abgeschlossenen Monats mit jeder Änderung an einem Plan oder Dauerauftrag — eine Kategorie spränge nachträglich von „5 € über" auf „5 € unter Budget".

- **Monat vor dem laufenden Berliner Monat:** Beide Loader liefern den gespeicherten Stand. Fehlt er, wird er nach den Regeln oben aus den heutigen Plänen, Monats-Budgets und Daueraufträgen berechnet, gespeichert und zurückgegeben. Auch „kein Budget" wird gespeichert — ein Plan, der später angelegt wird, gilt nicht für diesen Monat.
- **Laufender Monat:** wird bei jedem Lesen neu berechnet. Dabei wird der Stand des Vormonats gespeichert, falls er noch fehlt: Ein Monat friert ein, sobald er vorbei ist und jemand die App öffnet (Dashboard).
- **Künftige Monate:** werden bei jedem Lesen neu berechnet.
- **Bei der ersten Änderung friert alles Vergangene ein** (`freezePastMonths`): Bevor sich etwas ändert, aus dem Budgets berechnet werden — Budget-Plan anlegen, ändern oder löschen (`/api/budget-plans`), Monats-Budget mit Kategorie anlegen (`POST /api/budgets`), Kategorie zusammenführen oder mit Fallback löschen —, werden alle abgeschlossenen Monate ohne Snapshot eingefroren: vom Berliner Monat der frühesten nicht gelöschten Buchung des Haushalts bis zum Vormonat, mit dem Stand vor der Änderung. Monate mit Snapshot bleiben unverändert. So gilt eine Plan-Änderung auch dann nicht für den Vormonat, wenn seit Monatsende noch niemand die App geöffnet hat, und Monate aus der Zeit vor der Einführung behalten ihr damaliges Budget. Sind schon alle Monate eingefroren, kostet das eine Abfrage; sonst wird je Jahr einmal gerechnet. Gleichzeitige Aufrufe sind unkritisch (`ON CONFLICT DO NOTHING`). Dasselbe gilt vor dem Anlegen, Ändern und Löschen eines Dauerauftrags und vor „Als Dauerauftrag anlegen" aus einer Buchung, denn Daueraufträge bestimmen die Monatsanteile von `YEARLY`-Plänen.
- **Monate, die noch nie gelesen und vor keiner Änderung eingefroren wurden** (etwa Monate vor der frühesten Buchung): frieren beim ersten Lesen mit dem dann gültigen Stand ein.
- Gespeichert werden nur Kategorien mit Budget. Eine gelöschte Kategorie wird beim Lesen ausgelassen; beim Zusammenführen geht ihr Betrag auf die Zielkategorie über (siehe oben).
- Lesen zwei Aufrufe denselben Monat gleichzeitig zum ersten Mal, speichert einer; der andere liest dessen Zeile (`ON CONFLICT DO NOTHING`).
- Folge für `YEARLY`-Pläne: Wird ein Plan oder ein Dauerauftrag im Lauf des Jahres geändert, behalten die abgeschlossenen Monate ihre alten Anteile, die übrigen werden neu verteilt. Die 12 angezeigten Monatswerte ergeben dann nicht mehr genau den Jahresbetrag.

**Angebunden:** `GET /api/analytics/summary` (`categoryBudgets`, auch bei `spent = 0`), `GET /api/analytics/monthly-review` (`budgetCents`; Kategorien nur mit Budget erscheinen mit `transactions: []`), `GET /api/analytics/category-year` (`budgetMonthlyCents`) und die Budget-Warnung per Push — siehe Abschnitt „Budget-Warnung".

## Budget-Auswertung im Dashboard

Im Summary-Endpoint wird pro Kategorie-Budget berechnet:

```typescript
// categoryBudgetsRaw: Record<categoryId, effektives Budget in Cent> (Plan hat Vorrang, Monats-Budget nur Fallback ohne Plan)
const categoryBudgets = Object.entries(categoryBudgetsRaw).map(([categoryId, budgetCents]) => {
  const spentCents = byCategoryCents[categoryId] ?? 0;
  return {
    categoryId,
    name: updatedNameMap[categoryId] ?? categoryId,
    budget: budgetCents / 100,
    spent: spentCents / 100,
    diff: (spentCents - budgetCents) / 100
  };
});
```

| Feld | Bedeutung |
|---|---|
| `budget` | Effektives Budget des laufenden Monats (immer neu berechnet) |
| `spent` | Gebuchte Ausgaben + geplante Dauerauftrags-Ausgaben dieser Kategorie |
| `diff` | `spent - budget`: positiv = über Budget, negativ = unter Budget |

**Was in `spent` einfließt:**
- Gebuchte Ausgaben dieser Kategorie im laufenden Monat (Klasse `outcome`, alle Konten des Haushalts)
- **Geplante** Daueraufträge dieser Kategorie: im Monat fällig, nicht übersprungen und für die Periode des Monats noch nicht gebucht. Ein bereits gebuchtes Vorkommen steckt in den gebuchten Ausgaben und wird nicht noch einmal addiert (siehe [03-wiederkehrende-transaktionen.md](./03-wiederkehrende-transaktionen.md)).

Im Dashboard ist `spent` damit eine Hochrechnung bis Monatsende. Im Rückblick (`spentCents`) und in der Jahresübersicht steht nur Gebuchtes; nach Monatsende sind die Zahlen gleich.

## Geplantes Sparen (plannedSavings)

```typescript
const plannedBudgetAgg = await prisma.budget.aggregate({
  where: { ...inHousehold, categoryId: null, month, year, completedAt: null },
  _sum: { amountCents: true }
});
const plannedSavings = (plannedBudgetAgg._sum.amountCents ?? 0) / 100;
```

- Summiert die Zielbeträge aller **aktiven** Sparziele des Haushalts, deren Zielmonat der laufende Monat ist — es können mehrere sein
- Abgeschlossene Ziele (`completedAt` gesetzt) und Ziele ohne Termin zählen nicht
- Der Endpoint verrechnet den Wert nicht mit `monthlySavingsActual`; den Vergleich von geplantem und tatsächlichem Sparen bildet das Dashboard aus beiden Feldern

## Budget-Warnung (Push)

`checkBudgetAlerts` (`lib/budgetAlerts.ts`) sendet einen Push, wenn die Kategorie einer Buchung 80 % oder 100 % ihres Budgets erreicht hat. Gemeldet wird nur die höchste erreichte Schwelle; niedrigere gelten damit als gemeldet.

- **Nur für den laufenden Monat:** Liegt die Buchung in einem anderen Berliner Monat als dem laufenden — eine korrigierte alte oder eine vor- oder rückdatierte Buchung —, wird nichts geprüft: kein Push, kein Log-Eintrag, und die Budgets werden gar nicht erst geladen (das würde einen vergangenen Monat nebenbei einfrieren).

- **Wann geprüft wird:** nach dem Anlegen einer Buchung (`POST /api/transactions`), nach dem Bearbeiten (`PATCH /api/transactions/[id]` — für Kategorie und Monat, in denen die Buchung danach liegt, also nur, wenn das der laufende Monat ist), je gebuchter Gruppe eines Belegs (`POST /api/transactions/batch`) und für den Kauf, der beim Abschluss eines Sparziels gebucht wird ([07-sparziele.md](./07-sparziele.md)). Sync (`/api/sync/push`) und automatisch gebuchte Daueraufträge rufen die Prüfung nicht auf.
- **Wer benachrichtigt wird:** alle Mitglieder des Haushalts, die `notifyBudgetAlerts` eingeschaltet haben — nicht nur, wer gebucht hat —, jeweils in ihrer Sprache (`User.locale`). Gesperrte und gelöschte Nutzer bekommen nichts. Hat niemand die Warnung eingeschaltet, wird die Schwelle nicht als gemeldet vermerkt.
- **Einmal je Schwelle:** Der `BudgetAlertLog` hat den Schlüssel `(householdId, categoryId, year, month, threshold)`. Dieselbe Schwelle meldet im selben Monat einmal für den Haushalt, egal wer bucht und auf welchem Konto. Der Schlüssel braucht keine `Budget`-Zeile: Die Warnung gilt für Budget-Pläne genauso wie für Monats-Budgets. Zeilen aus der Zeit davor tragen zusätzlich `budgetId`; die Migration hat ihnen Haushalt und Kategorie eingetragen, eine damals gemeldete Schwelle meldet also nicht erneut.
- **Ausgegeben** ist dieselbe Zahl wie `spent` im Dashboard: gebuchte Ausgaben der Kategorie im laufenden Berliner Monat, alle Konten des Haushalts, plus geplante Daueraufträge der Kategorie (fällig, nicht übersprungen, für den Monat noch nicht gebucht und nicht vor `bookFromPeriod`).
- **Budget** ist dieselbe Zahl wie `budget` im Dashboard (`loadEffectiveCategoryBudgets`): der Budget-Plan der Kategorie, sonst die Monats-Budgets des Haushalts zusammen. Verglichen wird ganzzahlig (`spent × 100 >= Schwelle × budget`).
- Fehler beim Versand werden geschluckt, je Empfänger einzeln: Die Buchung scheitert nie an einem Push-Problem, und ein Fehler bei einem Mitglied verhindert den Push an das andere nicht.
- Jeder Versand an einen Push-Dienst wartet höchstens 5 Sekunden (`PUSH_SEND_TIMEOUT_MS` in `lib/push.ts`). Die Buchungs-Routen warten auf die Prüfung; ein hängender Push-Dienst hielte sonst die Antwort offen, obwohl die Buchung längst gespeichert ist. Eine Zeitüberschreitung zählt als fehlgeschlagener Versand; das Abo bleibt bestehen (gelöscht wird es nur bei `404`/`410`).

## API

| Methode | Endpoint | Beschreibung |
|---|---|---|
| GET | `/api/budgets` | Alle `Budget`-Zeilen des Haushalts, auch Sparziele (Jahr und Monat absteigend) |
| POST | `/api/budgets` | Neues Monats-Budget anlegen (mit Kategorie: vorher `freezePastMonths`) |
| GET/POST | `/api/budget-plans` | Budget-Pläne lesen (`?year=`, Standard: laufendes Jahr in Europe/Berlin) und anlegen (vorher `freezePastMonths`) |
| PATCH/DELETE | `/api/budget-plans/[id]` | Plan ändern oder weich löschen (vorher `freezePastMonths`) |

**POST-Body `/api/budgets`:**
```typescript
{
  accountId: string,
  categoryId?: string,  // fehlt = Zeile ohne Kategorie (Sparziele entstehen sonst über /api/saving-plan)
  month: number,        // 1-12
  year: number,
  amountCents: number   // Integer, keine weitere Prüfung
}
```

## Oberfläche: Seite `/budgets`

Die Seite `/budgets` (Navigation: „Budgets") verwaltet die Budget-Pläne je Kategorie. Pro budgetierbarer Kategorie wählt man „Monatlich" oder „Jährlich" und gibt einen Betrag ein (Eingabe deutsch oder englisch, z. B. `1.234,56` oder `12.5`, geparst mit `parseMoneyInput` aus `@doewe/shared`). Bei „Jährlich" zeigt eine Vorschau die 12 Monatswerte; das Jahr (`?year=`) bestimmt die Verteilung, da sie vom monatlich verfügbaren Geld der Daueraufträge dieses Jahres abhängt. Die Vorschau (`GET /api/budget-plans`) rechnet immer mit dem heutigen Stand; für abgeschlossene Monate gilt in Rückblick und Jahresübersicht der eingefrorene Wert. Speichern/Entfernen laufen über `/api/budget-plans`; danach werden Dashboard und Rückblick neu geladen.

## Jahresblick: Budget-Status je Kategorie und Monat

Die Seite `/yearly` zeigt die tatsächlichen Buchungen je Kategorie und Monat (`GET /api/analytics/category-year`, `buildCategoryYearMatrix`) gegen das effektive Monatsbudget (`loadEffectiveCategoryBudgetsForYear`: Plan vor altem Monats-`Budget`; ein altes Budget gilt nur in den Monaten, für die eine Zeile existiert, sonst gibt es dort kein Budget). Die Monate vor dem laufenden Monat kommen aus dem eingefrorenen Stand (fehlende werden beim Lesen gespeichert), der laufende und die künftigen werden neu berechnet — siehe „Abgeschlossene Monate sind eingefroren".

**Gruppen und Beträge:**

- Jahr und Monat sind der Berliner Kalender von `occurredAt` (Grundregeln §1); alle Konten des Haushalts.
- Die Gruppe ist eine Eigenschaft der **Buchung**, nicht der Kategorie: `classifyFlow` ordnet jede Buchung einzeln ein (Grundregeln §2), `Category.isIncome` entscheidet nichts. Eine Kategorie kann deshalb gleichzeitig eine Zeile unter Einnahmen (Erstattungen) und eine unter Ausgaben haben.
- Ausgaben-Zeilen sind **brutto**: eine Erstattung mindert sie nicht. Spar-Zeilen sind netto (Einzahlungen minus Entnahmen, können negativ sein).
- Buchungen ohne Kategorie oder mit einer gelöschten Kategorie stehen als Zeile `uncategorized`.
- Die Gruppensummen eines Monats entsprechen Einnahmen, Ausgaben und Gespart des Rückblicks für diesen Monat (Grundregeln §6).
- Vor dem Rechnen werden fällige, nie gebuchte Vorkommen abgeschlossener Monate nachgebucht (wie im Dashboard).

**Status je Monats- und Summenzelle** (`data-budget-status`):

| Status | Bedingung |
|---|---|
| `over` | Ausgabe **strikt größer** als ein Budget > 0 (genau auf Budget ist nicht „über") |
| `warn` | nicht über, aber Ausgabe >= **85 %** des Budgets (`ausgabe * 100 >= budget * 85`, ganzzahlig) |
| `ok` | unter 85 % des Budgets |
| `none` | kein Budget (oder Budget <= 0) in dem Monat bzw. für die Kategorie |

Die Summenzelle vergleicht nur die Monate mit Budget gegen deren Budgetsumme (`overYear`); Ausgaben in Monaten ohne Budget zählen nicht. Farbe ist nie alleiniger Bedeutungsträger: `over`/`warn` tragen zusätzlich unsichtbaren Text für Screenreader, eine Legende erklärt die Farben.

## Hinweis: Budget-Modell wird auch für Sparpläne verwendet

Das `Budget`-Modell wird **doppelt genutzt**:

1. Als **Monats-Budget** (Kategorie-Budget): über `/api/budgets`
2. Als **Sparziel** (Saving Plan): über `/api/saving-plan`

Der Unterschied:
- Kategorie-Budget: `categoryId` gesetzt, `title` meist leer
- Sparziel: `categoryId = null`, `title` immer gesetzt, Monat/Jahr = Zieltermin (optional)

Die Sparplan-Routen behandeln nur Zeilen ohne Kategorie; ein Kategorie-Budget liefert dort `404`.

Siehe [07-sparziele.md](./07-sparziele.md) für die Sparziel-Logik.
