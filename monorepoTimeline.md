# Monorepo Timeline

- 2025-10-19: Refactor Docs. Goal: Klarere Onboarding‑Doku. Why: Redundanz/Unschärfen. How: README neu strukturiert; Copilot‑Richtlinien konsolidiert und auf Deutsch; Changelog/Timeline aktualisiert.
- 2025-10-19: Fix Next.js Config. Goal: Dev-Server starten. Why: Next 14 lädt kein next.config.ts. How: `apps/web/next.config.ts` entfernt, `apps/web/next.config.mjs` hinzugefügt.
- 2025-10-19: Scaffold Next.js app in apps/web (App Router, TS, basic layout/page). Goal: UI Startpunkt. Why: frühe End‑to‑End Sicht. How: package.json aktualisiert, tsconfig/next.config, app/* Dateien, root dev:web Script.
- 2025-10-19: Initial monorepo scaffolding created: workspaces (apps/*, packages/*), root scripts (lint, typecheck, test, build), .editorconfig, .gitignore, .npmrc, and empty app/package folders.
