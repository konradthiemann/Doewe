# Doewe — Berechnungsdokumentation

Diese Dokumentation beschreibt alle Berechnungslogiken und Datenflüsse der Doewe Finance-Plattform.
Sie dient sowohl als Referenz für Entwickler als auch als Wissensbasis für Claude-Tools.

## Inhalt

| Datei | Thema |
|---|---|
| [01-geld-cents.md](./01-geld-cents.md) | Cents-System, Geldtypen, Parsing und Arithmetik |
| [02-transaktionen.md](./02-transaktionen.md) | Transaktionsklassifizierung (Einnahme / Ausgabe / Sparen) |
| [03-wiederkehrende-transaktionen.md](./03-wiederkehrende-transaktionen.md) | Dauerauftrags-Scheduling, Fälligkeitsberechnung, Skips |
| [04-analytics-summary.md](./04-analytics-summary.md) | Monatliche Zusammenfassung — alle Dashboard-Kennzahlen |
| [05-analytics-quarterly.md](./05-analytics-quarterly.md) | Quartalübersicht — letzte 3 Monate |
| [06-budgets.md](./06-budgets.md) | Budget-Ziele vs. tatsächliche Ausgaben |
| [07-sparziele.md](./07-sparziele.md) | Sparpläne, verfügbares Guthaben, empfohlene Monatsrate |

## Kernprinzipien

1. **Alle Beträge intern in Cents (Integer)** — niemals Floating-Point-Arithmetik für Geld.
2. **Positiv = Einnahme, Negativ = Ausgabe** — gilt für `amountCents` in allen Modellen.
3. **Spar-Kategorie ist separat** — Buchungen mit der "savings"/"sparen"-Kategorie werden aus Ausgaben herausgerechnet.
4. **Daueraufträge sind nur Vorlagen** — sie werden nicht automatisch als echte Transaktionen gebucht, sondern als "geplant" in Analytics eingerechnet.
5. **Nur ein Konto pro Nutzer** — Multi-Account-Aggregation ist noch nicht implementiert.

## Datenmodell-Übersicht

```mermaid
erDiagram
    User ||--o{ Account : "hat"
    User ||--o{ Category : "definiert"
    Account ||--o{ Transaction : "enthält"
    Account ||--o{ RecurringTransaction : "hat"
    Account ||--o{ Budget : "hat"
    Category ||--o{ Transaction : "klassifiziert"
    Category ||--o{ RecurringTransaction : "klassifiziert"
    Category ||--o{ Budget : "verknüpft mit"
    Budget ||--o{ Transaction : "savingGoalId"
    RecurringTransaction ||--o{ RecurringTransactionSkip : "kann übersprungen werden"

    Transaction {
        string id
        int amountCents "positiv=Einnahme, negativ=Ausgabe"
        string description
        DateTime occurredAt
        string categoryId "optional"
        string savingGoalId "optional, verknüpft mit Budget"
    }

    RecurringTransaction {
        string id
        int amountCents
        string frequency "immer MONTHLY"
        int intervalMonths "1-24"
        int dayOfMonth "1-31"
        DateTime nextOccurrence
    }

    Budget {
        string id
        int amountCents "Ziel-Betrag"
        int month "1-12"
        int year
        string categoryId "null = Spar-Budget"
        string title
    }

    RecurringTransactionSkip {
        string recurringId
        int year
        int month
    }
```
