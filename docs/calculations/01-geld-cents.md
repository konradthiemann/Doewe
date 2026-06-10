# Geld-Darstellung: Cents-System

**Quelle:** `packages/shared/src/money.ts`

## Warum Cents?

JavaScript-Floating-Point: `0.1 + 0.2 === 0.30000000000000004`

Deshalb werden alle Geldbeträge als **ganze Zahlen in Cent** gespeichert und transportiert.

```
12,50 € → amountCents = 1250
-5,00 € → amountCents = -500
```

## Branded Type

```typescript
type Cents = number & { readonly __brand: "Cents" };
```

- Nur im Typsystem — zur Laufzeit eine normale `number`
- Verhindert, dass rohe `number`-Werte versehentlich als `Cents` übergeben werden

## Konvertierungsfunktionen

| Funktion | Input | Output | Zweck |
|---|---|---|---|
| `parseCents(str)` | `"12.50"`, `"12,50"`, `"-5"` | `Cents` | Nutzereingabe parsen |
| `fromCents(n)` | `1250` (DB-Integer) | `Cents` | Datenbank-Wert branden |
| `toDecimalString(c)` | `Cents` | `"12.50"` | Anzeige (ohne Währung) |

## Arithmetik

```typescript
add(a, b)        // a + b, immer Integer
sub(a, b)        // a - b, kann negativ sein
multiply(a, f)   // Math.round(a * f), z.B. für Prozentrechnungen
```

## Parse-Logik

```mermaid
flowchart TD
    A["Input-String z.B. '12,50'"] --> B[trim + Komma→Punkt]
    B --> C{Regex-Test:\n-?\d+(.d1-2)?}
    C -->|ungültig| ERR["Error: Invalid money string"]
    C -->|gültig| D[Split in intPart + fracPart]
    D --> E["fracPadded = (frac+'00').slice(0,2)\nz.B. '5'→'50', ''→'00'"]
    E --> F["absCents = intPart*100 + fracPadded"]
    F --> G{negativ?}
    G -->|ja| H["-absCents als Cents"]
    G -->|nein| I["absCents als Cents"]
```

## Ausgabe-Konvention

- Alle API-Endpoints geben Beträge in **Euro (Dezimal)** zurück: `amountCents / 100`
- Intern werden alle Berechnungen in Cents durchgeführt; Division durch 100 passiert erst am Ende der Route-Handler
- Ausnahme: `recurringTransactions` im Summary-Response geben `amountCents` zurück (roher Integer)

## Vorzeichen-Konvention

| Wert | Bedeutung |
|---|---|
| `amountCents > 0` | Einnahme (z.B. Gehalt) |
| `amountCents < 0` | Ausgabe (z.B. Miete) |
| `amountCents = 0` | Neutral (selten genutzt) |

Diese Konvention gilt einheitlich in `Transaction`, `RecurringTransaction` und bei allen Berechnungen.
