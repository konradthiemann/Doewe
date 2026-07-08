# Getting Started

Lokale Entwicklungsumgebung für das Doewe-Monorepo aufsetzen — von Clone bis
laufender App mit Demo-Daten.

## Voraussetzungen

| Werkzeug | Version | Woher |
|---|---|---|
| Node.js | 22.14.0 (gepinnt in `.nvmrc`) | `nvm use` liest die Datei automatisch |
| npm | kommt mit Node (workspaces-fähig) | – |
| Docker | aktuelle Version (für lokale Postgres) | Docker Desktop o. Ä. |

> Die root-`.npmrc` setzt `engine-strict=true`: Mit einer zu alten Node-Version
> schlägt `npm ci` **hart fehl** (Untergrenze laut `engines`: 18.18.0 — praktisch
> immer einfach `nvm use` ausführen, dann stimmt alles).

## Setup in vier Schritten

```bash
git clone https://github.com/konradthiemann/Doewe.git
cd Doewe
nvm use     # liest .nvmrc → Node 22.14.0
npm ci      # installiert alle Workspaces
```

`npm ci` löst automatisch das `postinstall`-Script aus, das den Prisma-Client
generiert (`npm --workspace @doewe/web run prisma:generate`). Die `prisma`-CLI ist
eine devDependency — ein Install mit `--omit=dev` bricht deshalb im `postinstall` ab.

## Env-Variablen

`.env.example` nach `apps/web/.env.local` kopieren (niemals committen):

| Variable | Bedeutung |
|---|---|
| `DATABASE_URL` | Postgres-Connection-String — einzige zwingend validierte Server-Variable (`apps/web/env.ts`). Für lokal: `postgresql://doewe:doewe@localhost:5432/doewe_local` (passt zur Docker-DB). |
| `NEXTAUTH_SECRET` | Secret für die NextAuth-JWT-Sessions; langen Zufallswert setzen. |
| `NEXTAUTH_URL` | Kanonische App-URL, lokal `http://localhost:3000`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Derzeit ungenutzt (Vorbereitung für optionales Google-Login) — kann lokal leer bleiben. |
| `SMTP_*`, `RESEND_API_KEY`, `EMAIL_FROM` | Optionaler Mail-Transport für Passwort-Reset. Ohne Konfiguration wird der Reset-Link nur in die Server-Konsole geloggt — für lokale Entwicklung ausreichend. |

## Lokale Datenbank (Docker)

```bash
npm run db:up:local     # docker compose up -d  → Container "doewe-postgres" (postgres:16)
npm run db:down:local   # docker compose down   (Daten bleiben im Volume doewe_pg_data)
```

## Entwickeln

**One-Command-Setup** — startet DB, pusht das Schema, seedet Demo-Daten und
startet den Dev-Server:

```bash
npm run dev:web:local
```

Danach reicht im Alltag:

```bash
npm run dev:web         # nur Next.js dev server (DB muss laufen)
```

### Demo-Login

Der Seed legt einen Demo-User mit 36 Monaten Beispieldaten an (idempotent,
versioniert — ein erneuter Seed überspringt sich selbst, wenn die Daten aktuell
sind):

- **E-Mail:** `demo@doewe.test`
- **Passwort:** `demo1234`

## Qualitäts-Checks

```bash
npm run lint            # ESLint alle Workspaces
npm run typecheck       # tsc --noEmit alle Workspaces (inkl. astro check für Docs)
npm run test            # Vitest alle Workspaces
npm run build           # Build alle Workspaces
npm run ci              # alles nacheinander
```

> ⚠️ `npm run test` führt vorher `pretest` in `apps/web` aus: `prisma db push` +
> Seed — **schreibt also in die Datenbank aus `DATABASE_URL`**. Niemals mit einer
> Produktions-URL laufen lassen.

## Häufige Stolpersteine

1. **Schema geändert?** Danach immer `npm --workspace @doewe/web run prisma:generate`
   ausführen, sonst passt der generierte Client nicht mehr zum Schema.
2. **`npm ci` schlägt fehl** → Node-Version prüfen (`nvm use`), siehe `engine-strict` oben.
3. **`dev:web:lan`** gibt eine hartkodierte LAN-IP aus (`192.168.2.137`) — sie stimmt
   nur auf dem ursprünglichen Entwicklungsrechner; der eigentliche Server lauscht
   über `HOST=0.0.0.0` trotzdem im ganzen LAN.
4. **Migrationen in Produktion** laufen nicht lokal, sondern als Railway
   Pre-Deploy Command — Details in [Deployment & CI](./deployment.md) und
   [Database Management](./DATABASE_MANAGEMENT.md).
