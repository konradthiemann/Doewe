# Hooks & Rules — Automatisierungen

## Hooks

Hooks sind Shell-Skripte in `.claude/hooks/` die automatisch bei bestimmten Events ausgeführt werden.

### git-safety.sh — blocking

**Trigger:** Vor jedem Bash-Befehl der mit `git` beginnt.

Blockiert:
- `git push --force` / `git push -f`
- `git push origin main` / `git push origin master`
- `git reset --hard`
- `git clean -f`

Bei einem Block gibt Claude eine alternative Vorgehensweise vor (z.B. `git stash` statt `reset --hard`).

---

### post-edit-lint.sh — blocking

**Trigger:** Nach jedem Edit oder Write auf `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`

Führt ESLint auf die geänderte Datei aus. Erkennt automatisch den Workspace:
- Datei in `apps/web/` → ESLint mit `apps/web/.eslintrc.json` (extends next/core-web-vitals)
- Datei in `packages/shared/` → ESLint mit `packages/shared/.eslintrc.json`

Bei ESLint-Fehlern blockiert der Hook und Claude korrigiert sie direkt.

**Nicht ausgeführt für:** `node_modules`, `.next/`, `dist/`, `build/`

---

### post-edit-typecheck.sh — async

**Trigger:** Nach jedem Edit oder Write auf `.ts`, `.tsx`

Läuft im Hintergrund und meldet TypeScript-Fehler zurück. Blockiert nicht die weitere Arbeit von Claude.

- `apps/web/` → `tsc -p tsconfig.json --noEmit --skipLibCheck`
- `packages/shared/` → `tsc --noEmit --skipLibCheck`

Der erste Run in `apps/web` kann 10–30 Sekunden dauern (Next.js type-generation).

---

### stop-notify.sh — async

**Trigger:** Wenn Claude eine Aufgabe abgeschlossen hat.

Zeigt eine macOS-Systembenachrichtigung mit dem Projektnamen — nützlich wenn Claude im Hintergrund läuft.

---

## Path-scoped Rules

Rules in `.claude/rules/` werden automatisch geladen wenn Claude Dateien in dem definierten Scope liest oder schreibt. Kein manuelles Einbinden nötig.

| Rule-Datei | Scope | Inhalt |
|---|---|---|
| `api-routes.md` | `apps/web/app/api/**` | Route-Handler-Konventionen, Auth-Guard-Pattern, Fehler-Responses |
| `tests.md` | `**/*.test.ts`, `apps/web/tests/**` | Vitest-Patterns, zwei Test-Typen, pretest-Verhalten |
| `shared-package.md` | `packages/shared/**` | Cross-Package Impact, Public-API-Konventionen |
| `components.md` | `apps/web/components/**`, `page.tsx`, `layout.tsx` | Server/Client-Entscheidung, Tailwind, WCAG 2.2 AA |

---

## Konfiguration anpassen

### Hook hinzufügen

1. Neues Skript in `.claude/hooks/` anlegen
2. Eintrag in `.claude/settings.json` unter dem passenden Event (`PreToolUse`, `PostToolUse`, `Stop`) ergänzen

### Rule anpassen

Rules sind Markdown-Dateien mit YAML-Frontmatter. Das `paths:`-Array akzeptiert Glob-Patterns:

```markdown
---
paths:
  - "apps/web/prisma/**"
---
# Prisma Schema Änderungen
...
```

### Hooks deaktivieren

In `.claude/settings.json` den entsprechenden Hook-Eintrag entfernen oder auskommentieren (JSON erlaubt keine Kommentare — Zeile löschen).
