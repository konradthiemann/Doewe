# Monorepo Timeline

- 2025-10-19: Fix Vitest Test-Erkennung. Goal: Tests werden vom Root und Workspace gefunden. Why: `No test files found`. How: `vitest.config.ts` Root gesetzt, Include-Pattern erweitert.
- 2025-10-19: CI eingeführt. Goal: Automatische Lint/Typecheck/Test/Build‑Prüfung. Why: Frühe Qualitäts-Gates. How: [.github/workflows/ci.yml](.github/workflows/ci.yml) mit Node aus [.nvmrc](.nvmrc), npm cache, Workspaces‑Skripte.
- 2025-10-19: TS-Basis zentralisiert. Goal: Einheitliche Typprüfung. Why: weniger Duplikate, klare Defaults. How: `shared/tsconfig/tsconfig.base.json` eingeführt; `apps/web`/`packages/shared` vererbt; Root-Skripte auf `-ws`.
- 2025-10-19: Refactor Docs. Goal: Klarere Onboarding‑Doku. Why: Redundanz/Unschärfen. How: README neu strukturiert; Copilot‑Richtlinien konsolidiert und auf Deutsch; Changelog/Timeline aktualisiert.
- 2025-10-19: Fix Next.js Config. Goal: Dev-Server starten. Why: Next 14 lädt kein next.config.ts. How: `apps/web/next.config.ts` entfernt, `apps/web/next.config.mjs` hinzugefügt.
- 2025-10-19: Scaffold Next.js app in apps/web (App Router, TS, basic layout/page). Goal: UI Startpunkt. Why: frühe End‑to‑End Sicht. How: package.json aktualisiert, tsconfig/next.config, app/* Dateien, root dev:web Script.
- 2025-10-19: Initial monorepo scaffolding created: workspaces (apps/*, packages/*), root scripts (lint, typecheck, test, build), .editorconfig, .gitignore, .npmrc, and empty app/package folders.
