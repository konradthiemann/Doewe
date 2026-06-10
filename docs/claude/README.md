# Claude Code — Nutzungsguide für Doewe

Dieses Verzeichnis dokumentiert die Verwendung von Claude Code im Doewe-Projekt.

## Inhalt

| Datei | Beschreibung |
|---|---|
| [setup.md](setup.md) | Ersteinrichtung + Voraussetzungen |
| [agents.md](agents.md) | Agent-Referenz mit konkreten Beispielen |
| [workflows.md](workflows.md) | Empfohlene Workflows für typische Aufgaben |
| [hooks-and-rules.md](hooks-and-rules.md) | Automatisierungen (Hooks) und Scope-Regeln |

## Schnellübersicht: Wann welchen Agent nutzen?

```
Neues Feature (multi-layer)?    → @orchestrator
Plan vor der Implementierung?   → @planner
Code schreiben / refactoren?    → @implementer
Diff / PR reviewen?             → @reviewer
API-Routen auf Sicherheit?      → @security
UI-Komponente / Accessibility?  → @ui-ux
Schema-Änderung / Prisma?       → @data-analyst
Docs / CHANGELOG aktualisieren? → @docs
Agents selbst veraltet?         → @agent-quality
```

## Voraussetzungen
- Claude Code CLI installiert (`npm install -g @anthropic-ai/claude-code` oder via Homebrew)
- Projekt-Verzeichnis: `/Users/konrad.thiemann/Doewe`
- Hooks und Settings sind bereits konfiguriert (`.claude/settings.json`)
