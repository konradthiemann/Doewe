# Grundregeln — ein Betrag, eine Bedeutung

Jede Zahl in Doewe wird aus denselben Buchungen nach denselben Regeln gebildet. Wer eine Auswertung
baut oder ändert, hält sich an diese Seite; die übrigen Seiten in diesem Verzeichnis beschreiben
einzelne Bildschirme und dürfen ihr nicht widersprechen.

Stand: 19. November 2026

## 1. Kalender: Europe/Berlin

Eine Buchung gehört zu dem Kalendertag, -monat und -jahr, den ihr `occurredAt` **in der Zeitzone
Europe/Berlin** hat. Dasselbe gilt für „heute" und „aktueller Monat" auf dem Server, für den Monat
eines Dauerauftrag-Ankers (`nextOccurrence`) und für `Budget.completedAt`.

- Die Zeitzone ist die Konstante `APP_TIME_ZONE` in `packages/shared/src/calendar.ts`. Server und
  Browser rechnen beide mit den Helfern aus dieser Datei (`zonedMonth`, `zonedDate`,
  `zonedMonthRange`, `zonedDayRange`, `zonedYearRange`, `zonedTimeToUtc`, `zonedDayKey`).
- Nicht verwenden, um einen Kalendertag oder -monat zu bestimmen: `new Date(jahr, monat, tag)`,
  `getMonth()`, `getFullYear()`, `getDate()`, `getDay()`, `setMonth()` sowie `startOfDay`,
  `startOfMonth` und verwandte Funktionen aus date-fns. Sie rechnen in der Zeitzone des Prozesses —
  in Produktion UTC, im Browser die Geräteeinstellung. Eine Buchung um 00:30 Uhr am 1. liegt in UTC
  noch im Vormonat.
- Zeiträume sind halboffen: `occurredAt >= start` und `occurredAt < end`.
- Wer einen Zeitpunkt für einen Kalendertag erzeugt (automatisch gebuchter Dauerauftrag, Anker,
  Belegdatum, rück- oder vordatierte Buchung), schreibt **12:00 Uhr Berliner Zeit** dieses Tages.
  Mittag ist in Berlin und in UTC derselbe Kalendertag.
- Bestehende Daten brauchen keine Migration: Mitternacht UTC, Mitternacht Berlin und Mittag liegen
  alle auf demselben Berliner Kalendertag.

## 2. Einnahme, Ausgabe, Sparen

Die Einordnung steht in `packages/shared/src/cashflow.ts` (`classifyFlow`, `sumFlows`) und gilt in
dieser Reihenfolge:

1. Liegt die Buchung in einer **Spar-Kategorie**, ist sie eine Umbuchung in den oder aus dem
   Spartopf — unabhängig vom Vorzeichen. Einzahlung = negativer Betrag, Entnahme = positiver Betrag.
   Sie ist weder Einnahme noch Ausgabe. „Gespart" ist der Saldo: Einzahlungen minus Entnahmen (kann
   negativ sein).
2. Sonst gilt das Vorzeichen: `amountCents >= 0` ist Einnahme, `amountCents < 0` ist Ausgabe.

Folgerungen:

- Spar-Kategorie ist **jede** Kategorie des Haushalts, deren Name ohne Leerraum am Rand und ohne
  Beachtung der Groß-/Kleinschreibung `savings` oder `sparen` lautet. Gibt es mehrere, zählen alle.
- Das Feld `Category.isIncome` entscheidet nichts. Es sortiert nur die Auswahl im Formular.
- Eine Erstattung (positiver Betrag in einer Ausgaben-Kategorie) ist eine Einnahme. Sie verringert
  die Ausgaben der Kategorie nicht.
- Ein Betrag von 0 zählt als Einnahme, damit jede Buchung genau eine Klasse hat.
- Immer gilt: `Einnahmen − Ausgaben − Gespart = Summe aller amountCents`.

## 3. Umfang

- Mandant ist der Haushalt. Auswertungen umfassen alle Konten des Haushalts.
- Gelöschte Buchungen (`deletedAt` gesetzt) zählen nirgends — auch nicht über verschachtelte
  `include`/`_count`-Abfragen, die der Soft-Delete-Filter in `lib/prisma.ts` nicht erreicht.
- Der öffentliche Demo-Account wird von haushaltsübergreifenden Auswertungen und vom automatischen
  Buchen ausgeschlossen.

## 4. Gebucht und geplant

- **Gebucht** ist, was als Buchung existiert. Rückblick, Quartalsübersicht, Jahresübersicht nach
  Kategorien, Kontostand und Übertrag zeigen ausschließlich Gebuchtes.
- **Geplant** ist ein Dauerauftrag, der im laufenden Monat fällig, nicht übersprungen und für diesen
  Monat noch nicht gebucht ist. Nur das Dashboard rechnet Geplantes ein, und nur in Werte, die als
  Hochrechnung bis Monatsende gekennzeichnet sind.
- Ein Vorkommen eines Dauerauftrags wird über `Transaction.recurringTransactionId` und
  `Transaction.recurringPeriod` (`JJJJ-MM`, der Monat, für den gebucht wurde) erkannt — nicht über den
  Monat von `occurredAt`. Verschieben oder Löschen der Buchung ändert deshalb nichts daran, dass der
  Monat als gebucht gilt.
- Eine von Hand erfasste Zahlung wird nie automatisch mit einem Dauerauftrag verknüpft. Liegt sie auf
  demselben Konto, hat denselben Betrag und dieselbe Kategorie (ohne Kategorie: dieselbe Beschreibung)
  und ist höchstens 7 Tage vor oder nach dem Fälligkeitstag eines offenen Vorkommens im laufenden
  Monat datiert, schlägt die App sie als dieses Vorkommen vor. Erst wenn der Nutzer bestätigt, wird sie
  verknüpft und der Monat gilt als gebucht; bis dahin zählt sie als gebucht und das Vorkommen als
  geplant, und der Dauerauftrag bucht am Fälligkeitstag wie immer.
- Monate vor `RecurringTransaction.bookFromPeriod` werden nie automatisch gebucht. Ein Dauerauftrag
  mit Startdatum in der Vergangenheit bucht deshalb erst ab dem laufenden Monat, außer das Nachbuchen
  wurde ausdrücklich verlangt.
- **Kontostand** = Summe aller Buchungen bis zum Ende des laufenden Monats.
  **Übertrag** = Summe aller Buchungen vor Beginn des Monats.

## 5. Geld

- Alle Beträge sind ganze Cents. Gerechnet wird in Cents; durch 100 geteilt wird erst für die
  Anzeige. Auch Differenzen und Prozentwerte entstehen aus Cent-Werten.
- Prozentwerte werden kaufmännisch auf ganze Prozent gerundet.

## 6. Was übereinstimmen muss

Diese Gleichungen sind als Tests hinterlegt (`apps/web/tests/reconciliation.test.ts`) und gelten für
jeden Monat `M`:

| Links | Rechts |
|---|---|
| Rückblick `M`: Ausgaben | Buchungsliste, Typ „Ausgaben", Zeitraum erster bis letzter Tag von `M`: Summe |
| Rückblick `M`: Einnahmen / Gespart | Buchungsliste mit Typ „Einnahmen" / „Sparen", gleicher Zeitraum |
| Rückblick `M`: Ausgaben | Summe der Kategorien im Rückblick = Summe der aufgeklappten Buchungen |
| Rückblick `M`: Kontostand Ende | Rückblick `M+1`: Kontostand Anfang = Dashboard-Übertrag in `M+1` |
| Rückblick `M` | Spalte `M` der Quartalsübersicht |
| Jahresübersicht nach Kategorien, Monat `M`: Gruppen-Summen | Rückblick `M`: Einnahmen, Ausgaben, Gespart |
| Dashboard nach Monatsende (alles gebucht) | Rückblick desselben Monats |
| „Ausgegeben" je Kategorie, gebucht | dieselbe Zahl im Rückblick und in der Jahresübersicht; Dashboard und Budget-Warnung rechnen im laufenden Monat zusätzlich das Geplante ein |

## 7. Spartopf, Sparziele und Budgets

- **Spartopf** = Einzahlungen in die Spar-Kategorien minus Entnahmen, über alle Konten des Haushalts.
  Davon abgezogen wird nur der Betrag, der für Ziele zurückgehalten wird, die abgeschlossen wurden,
  bevor Entnahmen gebucht wurden (`Budget.reservedCents`).
- Ein Sparziel abzuschließen bucht eine Entnahme aus dem Spartopf (höchstens so viel, wie im Topf ist)
  und auf Wunsch den Kauf als Ausgabe. Wieder öffnen nimmt die Entnahme zurück. Der Spartopf lässt
  sich deshalb immer aus den Buchungen nachrechnen.
- Das Budget einer Kategorie ist der Budget-Plan, sonst die Monats-Budgets des Haushalts zusammen.
  Für einen abgeschlossenen Monat gilt der Stand, der festgehalten wurde (`BudgetMonthSnapshot`) — beim
  ersten Lesen nach Monatsende oder spätestens vor der ersten Änderung an Plänen, Monats-Budgets oder
  Daueraufträgen. Spätere Änderungen wirken nur auf den laufenden und künftige Monate.
- Budget-Warnungen gibt es nur für den laufenden Monat. Sie vergleichen „Ausgegeben" (gebucht und
  geplant) mit diesem Budget und gehen an alle Mitglieder des Haushalts, die sie eingeschaltet haben.
- **Empfohlene Monatsrate:** der kleinste gleichbleibende Monatsbetrag, mit dem jedes datierte Ziel zu
  seinem Termin gedeckt ist; der laufende Monat zählt mit. Als bereits gedeckt gilt der Spartopf ohne
  die Einzahlungen dieses Monats, damit die Rate nicht sinkt, sobald man spart.
