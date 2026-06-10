# Agent-Referenz

Alle Agents liegen in `.claude/agents/`. Sie werden in Claude Code mit `@agent-name` aufgerufen.

---

## `@orchestrator`

**Wann:** Einstiegspunkt für jedes Feature das mehr als eine Datei oder Layer betrifft.

**Was er tut:** Dekomponiert den Request in Sub-Tasks pro Layer (Schema → API → UI → Tests → Docs), entscheidet welche Agents was übernehmen, liefert einen geordneten Aktionsplan.

```
@orchestrator Neues Feature: Nutzer soll monatliche Budget-Überschreitungen
per E-Mail benachrichtigt werden wenn 80% des Budgets erreicht sind.
```

---

## `@planner`

**Wann:** Vor der Implementierung eines nicht-trivialen Changes — um einen Fahrplan zu haben.

**Was er tut:** Erstellt einen detaillierten Layer-by-Layer Plan mit betroffenen Dateien, Reihenfolge der Änderungen, Risiken und Definition of Done. Schreibt keinen Code.

```
@planner Plane die Implementierung eines CSV-Exports für Transaktionen.
Ausgabe soll amountCents als Dezimalzahl in EUR enthalten.
```

---

## `@implementer`

**Wann:** Wenn ein Plan vorliegt und Code geschrieben werden soll.

**Was er tut:** Implementiert API-Routen, Komponenten, Schema-Änderungen, Tests. Folgt dem Doewe-Stack (Next.js App Router, Prisma, Tailwind, Zod, TypeScript strict).

```
@implementer Implementiere GET /api/accounts basierend auf diesem Plan:
[Plan von @planner einfügen]
```

---

## `@reviewer`

**Wann:** Vor jedem Commit / PR — oder nach einer Implementierung durch `@implementer`.

**Was er tut:** Review für TypeScript-Korrektheit, Prisma-Patterns, Testabdeckung, fehlende Error-Cases.

```
@reviewer Bitte reviewe diesen Diff:
[git diff einfügen oder Dateinamen angeben]
```

---

## `@security`

**Wann:** Bei jeder Änderung an API-Routen oder Auth-Flows.

**Was er tut:** Prüft Auth-Guards, fehlende Input-Validierung, SQL-Injection-Risiken, unsichere Defaults.

```
@security Prüfe alle Routen in apps/web/app/api/ auf fehlende Auth-Guards.
```

---

## `@ui-ux`

**Wann:** Bei neuen oder geänderten UI-Komponenten.

**Was er tut:** Review auf Accessibility (WCAG 2.2 AA), semantisches HTML, Keyboard-Navigation, Tailwind-Konsistenz, mobile Darstellung.

```
@ui-ux Review die TransactionForm-Komponente auf Accessibility-Probleme
und fehlende ARIA-Labels.
```

---

## `@data-analyst`

**Wann:** Bei Schema-Änderungen, neuen Prisma-Queries oder Domain-Modell-Entscheidungen.

**Was er tut:** Bewertet Schema-Impact, optimiert Prisma-Queries, prüft Migration-Risiken, denkt in Domain-Primitives.

```
@data-analyst Ich möchte RecurringTransaction um ein `endDate`-Feld erweitern.
Welche Schema-Änderungen und Migrations-Risiken gibt es?
```

---

## `@docs`

**Wann:** Nach einer Implementierung — um Inline-Docs, README und CHANGELOG aktuell zu halten.

**Was er tut:** Schreibt TSDoc-Kommentare, aktualisiert README-Abschnitte, ergänzt CHANGELOG (top-append).

```
@docs Aktualisiere README und CHANGELOG nach dem neuen CSV-Export-Feature.
```

---

## `@agent-quality`

**Wann:** Nach Stack-Updates (neue Next.js-Version, neue Dependencies, strukturelle Refactorings).

**Was er tut:** Prüft ob alle Agent-Dateien noch aktuelle Annahmen über den Stack machen und korrigiert veraltete Informationen.

```
@agent-quality Wir haben gerade auf Next.js 15 migriert.
Prüfe alle Agent-Dateien auf veraltete Annahmen.
```
