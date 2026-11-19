# Doewe

Persönliche Finanzplattform: Buchungen, Budgets, Sparziele, Daueraufträge und Auswertungen.
npm-Workspaces: `apps/web` (Next.js App Router mit API-Routen und Prisma), `packages/shared`
(Domänenlogik ohne I/O), `apps/docs` (Doku-Seite, gebaut aus `docs/`). Produktion läuft auf Railway
mit PostgreSQL.

Diese Datei hält fest, was sich nicht aus dem Code ablesen lässt. Aufbau, Abhängigkeiten und
Endpunkte stehen im Code und in `docs/`.

## Prüfen

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

CI (`.github/workflows/ci.yml`) verlangt alle vier.

- `npm run test` führt in `apps/web` vorher `prisma db push` und den Seed gegen `DATABASE_URL` aus.
  Die Variable muss auf eine Wegwerf-Datenbank oder ein eigenes Schema zeigen
  (`…/doewe_local?schema=doewe_test`), nie auf Daten, die erhalten bleiben sollen.
- Produktion und CI laufen in UTC, Entwicklerrechner in Europe/Berlin. Alles, was mit Datum rechnet,
  zusätzlich mit `TZ=UTC npm run test` prüfen. Tests für Datumslogik verwenden feste UTC-Zeitpunkte
  und eine festgehaltene Uhr (`vi.useFakeTimers({ toFake: ["Date"], now })`).
- API-Tests, die `TEST_USER_ID_BYPASS` setzen, brauchen `ensureTestHousehold` aus
  `apps/web/tests/testHousehold.ts`. Ohne Haushalts-Mitgliedschaft antwortet jede Route mit 401.
- Die Node-Version steht in `.nvmrc`; `engine-strict` lässt `npm ci` mit einer älteren scheitern.

## Rechnen mit Geld und Datum

Verbindlich ist `docs/calculations/00-grundregeln.md`. Das Wichtigste:

- Beträge sind ganze Cents. Geteilt wird erst für die Anzeige.
- Zu welchem Tag und Monat eine Buchung gehört, entscheidet die Zeitzone Europe/Berlin über die
  Helfer in `packages/shared/src/calendar.ts`. `new Date(jahr, monat, tag)`, `getMonth()` und
  verwandte Aufrufe rechnen in der Zeitzone des Prozesses und liefern auf dem Server andere Monate
  als im Browser.
- Einnahme, Ausgabe oder Sparen entscheidet `packages/shared/src/cashflow.ts`: erst die
  Spar-Kategorie, dann das Vorzeichen. `Category.isIncome` entscheidet nichts.
- Welche Zahlen übereinstimmen müssen, prüft `apps/web/tests/reconciliation.test.ts`. Eine neue
  Auswertung bekommt dort ihre Gleichung.

## Daten

- Mandant ist der Haushalt. Abfragen grenzen über `householdId` bzw. `account: { householdId }` ein.
  `userId` hält nur die Herkunft fest (`createdByUserId`, Push-Abos, Idempotenz-Log) und ist nie
  Berechtigungsgrenze. Aktionen nur für Inhaber prüfen `user.role === "OWNER"` und antworten sonst
  mit 403.
- Gelöscht wird per `deletedAt`. `lib/prisma.ts` ergänzt `deletedAt: null` nur im obersten `where`
  von `findMany`, `findFirst`, `count`, `aggregate` und `groupBy`. `findUnique` sowie verschachtelte
  `include`- und `_count`-Abfragen sehen gelöschte Zeilen.
- Das Modell `Account` ist ein Finanzkonto, nicht die OAuth-Tabelle von NextAuth. Deshalb gibt es
  keinen PrismaAdapter; Sitzungen sind JWT (`lib/authOptions.ts`).
- Der öffentliche Demo-Account (`lib/demoConstants`) schreibt bei jedem Aufruf von
  `/api/demo/seed` drei Jahre synthetische Daten. Haushaltsübergreifende Auswertungen und das
  automatische Buchen schließen ihn aus.
- `/api/admin/*` authentifiziert per Service-Token (`isAuthorizedService`) statt per Sitzung und
  greift bewusst über Haushaltsgrenzen. Schreibende Aktionen protokollieren in `AdminActionLog`.
  `/api/cron/*` verlangt `CRON_SECRET` als Bearer-Token.

## Schema ändern

- Jede Änderung an `apps/web/prisma/schema.prisma` braucht eine Migration unter
  `apps/web/prisma/migrations/`. Produktion spielt sie vor dem Deploy mit `prisma migrate deploy`
  ein (`docs/deployment.md`); `db push` wirkt nur lokal.
- `prisma db push --force-reset` und `prisma migrate reset` löschen alle Daten der Zieldatenbank.
  Scheitert `db push` lokal an einer neuen Pflichtspalte, die Migration-SQL direkt mit `psql`
  einspielen.

## Oberfläche

- Texte stehen in `apps/web/lib/locales/de.ts` und `en.ts` — immer in beiden.
- Farben, Radien und Schatten kommen aus den Design-Tokens (`docs/design/`), nicht aus Einzelwerten.
- Fokussierbare Controls bekommen mobil mindestens `text-base` (`text-base md:text-sm`); iOS Safari
  zoomt bei kleinerer Schrift in die Seite.
- Flex- und Grid-Kinder mit breitem Inhalt brauchen `min-w-0`, sonst läuft die Seite auf schmalen
  Geräten horizontal über.

## Sprache und Ablauf

- Dokumentation und Tickets auf Deutsch, Datumsformat „21. August 2026". Code, Kommentare in neuem
  Code und Commit-Messages auf Englisch (Conventional Commits).
- Änderungen kommen als Pull Request; gemergt wird von Menschen.
