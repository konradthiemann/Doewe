---
paths:
  - "apps/web/app/api/**"
---
# API Routes — Next.js App Router Route Handlers

Route-Dateien liegen in `apps/web/app/api/<ressource>/route.ts`.

## Struktur
- Export-Funktionen nach HTTP-Verb: `GET`, `POST`, `PUT`, `DELETE`
- Auth-Guard am Anfang jeder Handler-Funktion via `getSessionUser()` aus `../../../lib/auth`
- Autorisierung: Nur Daten des eigenen Accounts laden (`where: { account: { userId: user.id } }`)
- Validierung: Zod-Schema für POST/PUT-Bodies
- Antwort: `NextResponse.json(...)` mit explizitem Status-Code

## Konventionen (belegt aus vorhandenen Route-Dateien)
- Kein direkter Prisma-Import in Handler — Singleton aus `lib/prisma.ts` importieren
- Zod-Schema für Input-Validierung in `schema.ts` neben der `route.ts`
- Fehler-Responses: `{ error: "..." }` mit passendem HTTP-Status (401, 400, 404, 500)
- Datei-Header-Kommentar beschreibt Endpoints, Auth-Anforderung und Body-Shape

## Vor Änderungen
- Alle betroffenen route.ts-Dateien lesen
- Auth-Guard-Pattern in existierenden Routes prüfen bevor neues Pattern eingeführt wird
