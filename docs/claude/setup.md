# Setup — Claude Code für Doewe einrichten

## Voraussetzungen

- Node.js >= 18.18.0
- Claude Code CLI — [Installationsanleitung](https://docs.anthropic.com/claude-code)
- Zugriff auf das Doewe-Repository

## Claude Code starten

```bash
cd /Users/konrad.thiemann/Doewe
claude
```

## Was automatisch aktiv ist

Nach dem ersten `/init-claude` wurden folgende Konfigurationen eingerichtet:

### Hooks (`.claude/hooks/`)

| Hook | Trigger | Wirkung |
|---|---|---|
| `git-safety.sh` | Vor jedem `git`-Befehl | Blockiert force-push, direkten Push auf main, `reset --hard` |
| `post-edit-lint.sh` | Nach Edit/Write | ESLint auf geänderte Datei (blockierend) |
| `post-edit-typecheck.sh` | Nach Edit/Write | TypeScript-Check (async, im Hintergrund) |
| `stop-notify.sh` | Nach Aufgaben-Ende | macOS-Benachrichtigung |

### Path-scoped Rules (`.claude/rules/`)

Claude liest automatisch die passende Rule wenn eine Datei in diesem Scope bearbeitet wird:

- `api-routes.md` → `apps/web/app/api/**`
- `tests.md` → `**/*.test.ts`
- `shared-package.md` → `packages/shared/**`
- `components.md` → `apps/web/components/**`

### Agents (`.claude/agents/`)

9 spezialisierte Sub-Agents sind registriert. Claude lädt automatisch den passenden Agent wenn er via `@agent-name` aufgerufen wird.

## Ersteinrichtung prüfen

```bash
# Hooks sind ausführbar?
ls -la .claude/hooks/

# Settings sind valides JSON?
cat .claude/settings.json | python3 -m json.tool

# ESLint-Binary vorhanden?
ls node_modules/.bin/eslint
```

## Umgebungsvariablen

Claude Code benötigt einen API Key:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# oder dauerhaft in ~/.zshrc / ~/.bashrc eintragen
```

## Bekannte Besonderheiten

- Der `post-edit-typecheck`-Hook läuft async — TypeScript-Fehler erscheinen nach dem Edit, nicht direkt davor
- ESLint-Config in `apps/web` nutzt `"root": true` — der Hook cd'et in den richtigen Workspace
- Bei `packages/shared`-Änderungen prüfen ob `apps/web` Anpassungen benötigt (Cross-Package Impact)
