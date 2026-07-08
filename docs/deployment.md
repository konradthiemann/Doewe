# Deployment & CI

Wie Doewe gebaut, getestet und ausgeliefert wird – inklusive Troubleshooting für den
häufigsten Fall: „Die Produktion ist nicht auf dem Stand von `main`".

## Überblick

| Komponente | Läuft auf | Trigger |
|---|---|---|
| Web-App (`@doewe/web`) | Railway, Region `europe-west4` (Niederlande, EU) | Auto-Deploy bei Push auf `main` (mit Bedingungen, s. u.) |
| Datenbank (PostgreSQL) | Railway, Region `europe-west4` (EU) | – |
| Docs (`@doewe/docs`) | GitHub Pages | Auto-Deploy bei Push auf `main` mit Doc-Änderungen |
| Prod-Domain | <https://doewe.konradthiemann.de> | – |

Web-App und Datenbank liegen damit innerhalb der EU.

## Node-Version (wichtig)

Der Monorepo benötigt **Node ≥ 22.12**. Grund: Der Docs-Viewer (`apps/docs`, Astro 6 /
`@astrojs/mdx`) setzt diese Version voraus. Die Version ist zentral in **`.nvmrc`** gepinnt
(aktuell `22.14.0`).

- `.nvmrc` steuert sowohl die **CI** (`node-version-file: .nvmrc`) als auch die
  **Railway-Runtime** (railpack übernimmt die Node-Version ebenfalls aus `.nvmrc`, da keine
  separate Railway-/Nixpacks-Config existiert). Eine Änderung an `.nvmrc` wirkt also
  gleichzeitig auf CI **und** Produktion.
- Die root-`.npmrc` setzt `engine-strict=true` → eine zu alte Node-Version lässt `npm ci`
  **hart fehlschlagen** (statt nur zu warnen).

> Lokal vor dem ersten `npm ci` einfach `nvm use` ausführen – das liest `.nvmrc`.

## CI-Pipeline (`.github/workflows/ci.yml`)

Läuft bei **Push auf alle Branches** und bei **Pull Requests**. Jeder Job installiert per
`npm ci` mit der Node-Version aus `.nvmrc`:

1. **Lint** – `npm run lint -ws`
2. **Typecheck** – `npm run typecheck -ws` (inkl. `astro check` für die Docs)
3. **Test** – `npm run test -ws` (gegen einen ephemeren Postgres-Service; vor dem
   Testlauf wird das Prisma-Schema per `db:push` frisch in den Service gepusht —
   die Tests laufen also gegen das Schema, nicht gegen die Migrations-History)
4. **Build** – `npm run build -ws` (startet erst, wenn 1–3 grün sind)

Weitere Eigenschaften:

- **Concurrency:** `group: ci-${{ github.ref }}` mit `cancel-in-progress: true` — ein
  neuer Push auf denselben Branch bricht laufende CI-Runs ab. Relevant im Zusammenspiel
  mit dem Railway-Tor „Wait for CI to pass".
- **`workflow_dispatch`:** CI und Docs-Deploy lassen sich manuell aus der GitHub-UI
  (oder per `gh workflow run`) starten — z. B. um die Docs ohne neuen Commit neu zu
  deployen.
- **`postinstall`:** Jedes `npm ci` (CI **und** Railway-Build) generiert automatisch den
  Prisma-Client (`npm --workspace @doewe/web run prisma:generate`, root `package.json`).

## Auto-Deploy der Web-App (Railway)

Railway deployt `@doewe/web` bei Push auf `main` **nur, wenn beide** Bedingungen erfüllt sind:

1. **„Wait for CI to pass"** – die GitHub-Check-Suite (CI) muss **grün** sein.
2. **Watch Paths = `apps/web/**`** – der Push muss Dateien **unter `apps/web/`** geändert haben.

Ist eine Bedingung nicht erfüllt, erscheint der Deploy in Railway als **`SKIPPED`** mit einem
dieser Gründe:

| `skippedReason` | Bedeutung |
|---|---|
| `CI check suite failed` | CI war rot → Bedingung 1 nicht erfüllt. |
| `No changes to watched files` | Keine Änderung unter `apps/web/**` → Bedingung 2 nicht erfüllt. |

> Ein übersprungener Deploy hat kein Build-Artefakt (`canRedeploy: false`) und kann daher
> **nicht** einfach „neu deployt" werden – es braucht einen frischen Deploy (siehe
> Troubleshooting).

## Datenbank-Migrationen (Railway Pre-Deploy Command)

Migrationen laufen als **Pre-Deploy Command** direkt im Railway-Service `@doewe/web`
(*Settings → Deploy → Pre-Deploy Command*):

```
npm --workspace @doewe/web run prisma:migrate:deploy
```

Der Befehl läuft zwischen Build und Start im privaten Railway-Netz und nutzt die interne
`DATABASE_URL`-Referenz (`postgres.railway.internal`). Schlägt er fehl, wird **nicht deployt**.
Dadurch entfällt der frühere GitHub-Actions-Job samt `DATABASE_URL`-Secret (Public-Proxy),
der bei Passwort-Rotation brach. Details: [Database Management](./DATABASE_MANAGEMENT.md).

## Docs-Deploy (`.github/workflows/docs.yml`)

Bei Push auf `main` mit Änderungen unter `docs/**`, `apps/docs/**` oder am Docs-Workflow wird
der Starlight-Build erzeugt und auf **GitHub Pages** veröffentlicht. Der Build spiegelt die
Quell-Dateien aus `docs/*.md` automatisch via `apps/docs/scripts/sync-docs.mjs` in die
Starlight-Content-Collection.

**Neue Doku-Seite hinzufügen:**

1. Markdown-Datei in `docs/` anlegen (Top-Level, beginnend mit einer `# Überschrift` – diese
   wird zum Seitentitel). Unterordner werden nicht gespiegelt.
2. Seite in die `sidebar` in `apps/docs/astro.config.mjs` eintragen (Slug = Dateiname ohne
   `.md`, kleingeschrieben; `README.md` → `index`).

## Troubleshooting: „Produktion ist nicht auf dem Stand von `main`"

Symptom: Ein Merge auf `main` ist live nicht sichtbar; der zugehörige Railway-Deploy steht auf
`SKIPPED`.

1. **Skip-Grund prüfen** – Railway-Dashboard → Service `@doewe/web` → Tab *Deployments*
   (oder via API: `deployment(id).meta.skippedReason`).
2. **Bei `CI check suite failed`** – zuerst den CI-Fehler beheben. Achtung: Der reine
   CI-Fix-Commit löst **keinen** Deploy aus, wenn er `apps/web/**` nicht berührt (dann greift
   `No changes to watched files`). Beide Tore werden selten von einem einzigen Folge-Commit
   gemeinsam erfüllt.
3. **Aktuellen `main`-Stand manuell deployen** (umgeht beide Skip-Tore):
   - **Dashboard:** Service `@doewe/web` → *Deploy* / *Deploy latest commit*.
   - **CLI:** `railway redeploy` (Projekt/Environment/Service vorher verlinkt).
   - **API:** `serviceInstanceDeployV2(serviceId, environmentId, commitSha)`.
4. **Danach läuft es wieder automatisch:** Die nächste echte `apps/web`-Änderung mit grüner CI
   deployt von selbst.

### Warum die zwei Tore?

Im Monorepo sollen reine Docs- oder Root-Änderungen die Web-App nicht unnötig neu deployen –
dafür sorgt der Watch-Path `apps/web/**`. Wer möchte, dass **jeder** grüne `main`-Push deployt,
entfernt die Watch Paths im Railway-Service (*Settings → Build → Watch Paths*).
