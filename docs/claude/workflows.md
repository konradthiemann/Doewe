# Empfohlene Workflows

## Neues Feature (End-to-End)

Für Features die mehrere Layer berühren (DB + API + UI + Tests):

```
1. @orchestrator  →  Dekomposition in Sub-Tasks mit Layer-Reihenfolge
2. @planner       →  Detaillierter Implementierungsplan (Dateien, Reihenfolge, Risiken)
3. @data-analyst  →  Schema-Review wenn Prisma betroffen ist
4. @implementer   →  Layer für Layer implementieren (Schema → API → UI → Tests)
5. @reviewer      →  Code-Review vor dem Commit
6. @security      →  Auth-Guards + Input-Validierung prüfen
7. @ui-ux         →  Accessibility-Review neuer Komponenten
8. @docs          →  CHANGELOG + JSDoc aktualisieren
```

**Tipp:** Den Plan von `@planner` als Kontext für `@implementer` mitgeben — das verbessert die Ausgabe erheblich.

---

## Quick Bug Fix

```
1. @implementer   →  Fix direkt beschreiben, Dateiname + Fehlerbeschreibung mitgeben
2. @reviewer      →  Kurz-Review des Fixes
```

Beispiel:
```
@implementer In apps/web/app/api/transactions/route.ts gibt GET alle Transaktionen
zurück, auch von anderen Usern. Fix: WHERE-Clause auf userId einschränken.
```

---

## Schema-Migration

```
1. @data-analyst  →  Migration planen, Risiken + Reihenfolge bewerten
2. @implementer   →  schema.prisma ändern + Migration erstellen
3. @docs          →  CHANGELOG aktualisieren
```

Danach lokal:
```bash
npm --workspace @doewe/web run db:push
npm --workspace @doewe/web run prisma:generate
npm run test
```

Prod-Deploy:
```bash
npm --workspace @doewe/web run prisma:migrate:deploy
```

---

## PR-Review

```
1. @reviewer  →  Allgemeine Code-Qualität, TypeScript, Prisma-Patterns
2. @security  →  Sicherheits-Check (bei API-Änderungen)
```

Diff als Kontext mitgeben:
```
@reviewer
[git diff main..feat/mein-feature einfügen]
```

---

## Neue API-Route hinzufügen

```
1. @planner     →  Route-Design (Pfad, HTTP-Verbs, Request/Response-Shape, Auth-Anforderungen)
2. @implementer →  Route Handler + Zod-Schema in apps/web/app/api/<ressource>/route.ts
3. @security    →  Auth-Guard + Input-Validierung prüfen
4. @implementer →  Test in apps/web/tests/<ressource>.test.ts
5. @docs        →  docs/api-reference.md aktualisieren
```

Konvention beachten:
- Datei: `apps/web/app/api/<ressource>/route.ts`
- Export: HTTP-Verb-Funktionen (`GET`, `POST`, `PUT`, `DELETE`)
- Auth: `getSessionUser()` am Anfang, 401 wenn nicht eingeloggt

---

## @doewe/shared erweitern

```
1. @data-analyst  →  Prüfen ob die Funktion wirklich shared sein sollte
2. @implementer   →  Funktion in packages/shared/src/ implementieren + in index.ts exportieren
3. @implementer   →  Unit-Test in packages/shared/src/*.test.ts
4. @implementer   →  Import in apps/web anpassen
5. @reviewer      →  TypeScript-Typen + API-Design prüfen
```

---

## Stack-Update (Dependency-Upgrade)

```
1. @agent-quality  →  Alle Agent-Dateien auf Aktualität prüfen
2. @reviewer       →  Breaking Changes in den betroffenen Dateien identifizieren
3. @implementer    →  Notwendige Anpassungen implementieren
4. npm run ci      →  Lint + Typecheck + Test + Build lokal grün machen
```

---

## Typische Claude Code Befehle

```bash
# Session starten
claude

# Datei direkt analysieren lassen
claude "Erkläre die Logik in apps/web/app/api/analytics/summary/route.ts"

# Mit Agent starten
claude "@orchestrator Neues Feature: [Beschreibung]"

# Slash-Kommandos in laufender Session
/help          # Verfügbare Befehle
/clear         # Kontext leeren
/init-claude   # Setup aktualisieren (Hooks, Rules, CLAUDE.md)
```
