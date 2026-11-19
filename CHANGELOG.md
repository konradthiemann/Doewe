## [0.1.9] - 2026-11-19
### Added
- **Erklärungen an jeder Zahl:** Ein „i" neben Kennzahlen und Funktionen öffnet eine kurze Erklärung in Alltagssprache, wo sinnvoll mit Rechenbeispiel — auf dem Dashboard, in Buchungen, Rückblick, Sparplan, Budgets, Jahresübersicht, Steuer, im Buchungs- und Dauerauftragsformular, beim Beleg-Scan und beim Haushalt.
- **Sparziel abschließen bucht jetzt wirklich:** Der Betrag wird mit einer Buchung aus dem Spartopf genommen (höchstens so viel, wie im Topf ist), und der Kauf kann im selben Schritt als Ausgabe in einer Kategorie gebucht werden. Der Dialog fragt „Was hat es gekostet?", „Aus dem Spartopf nehmen?" und „Kauf als Ausgabe buchen?" und sagt in einem Satz, was passiert. „Wieder öffnen" nimmt die Entnahme zurück. Der Spartopf lässt sich damit immer aus den Buchungen nachrechnen.
- **Budget-Warnungen für Budget-Pläne und für beide:** Die Push-Mitteilung bei 80 % und 100 % im laufenden Monat kommt jetzt auch für Budgets, die unter „Budgets" angelegt wurden (vorher nie), und geht an alle im Haushalt, die sie eingeschaltet haben — auch nach dem Bearbeiten einer Buchung und nach einem Beleg-Scan.
- **Von Hand erfasste Zahlungen — die App fragt nach:** Trägst du eine Zahlung selbst ein, für die es einen Dauerauftrag gibt (gleicher Betrag, gleiche Kategorie, höchstens 7 Tage um den Fälligkeitstag), fragt die Übersicht unter „Steht diesen Monat noch an": „Schon bezahlt? … Das war dieser Dauerauftrag". Bestätigst du, wird der Dauerauftrag diesen Monat nicht noch einmal gebucht und nicht doppelt gezählt. Ohne Bestätigung wird nichts verknüpft — eine zusätzliche Zahlung mit gleichem Betrag (zum Beispiel eine Extra-Einzahlung ins Sparen) bleibt so, wie sie ist. Buchungen eines Dauerauftrags sind in der Liste gekennzeichnet.
- **Sparübersicht auf dem Dashboard:** „Diesen Monat gespart", „Empfohlene Monatsrate", ein Balken dazu und „Im Spartopf" — statt des vollen Zielbetrags der in diesem Monat fälligen Ziele.
### Changed
- **Daueraufträge mit Startdatum in der Vergangenheit** buchen die vergangenen Monate nur noch, wenn „Vergangene Monate nachbuchen" angekreuzt ist (mit Angabe, wie viele Buchungen das wären). Das gilt auch, wenn der Rhythmus geändert oder eine ältere Buchung zum Dauerauftrag gemacht wird. Das Startdatum darf höchstens 10 Jahre vor oder nach heute liegen; Startdatum und „Tag des Monats" widersprechen sich beim Anlegen nicht mehr.
- **Budgets vergangener Monate bleiben stehen:** Wird ein Budget oder ein Dauerauftrag geändert, wirkt das nur auf den laufenden und künftige Monate. Vorher konnte eine Kategorie im Rückblick nachträglich von „über Budget" auf „unter Budget" springen. Beim Zusammenlegen von Kategorien wandert das festgehaltene Budget mit.
- Beträge in der Buchungsliste und in der Steuer-Übersicht im selben Format wie überall (`1.234,56 €`).
- Sparplan: „Geplantes Sparen" heißt „Empfohlene Monatsrate" und sinkt nicht mehr in dem Monat, in dem ein Ziel abgeschlossen wird; „X ausgegeben" an einem Ziel zählt Ausgaben minus Erstattungen statt aller verknüpften Buchungen.
### Fixed
- **Demo-Zugang:** Ein gesperrtes oder gelöschtes Demo-Konto meldete sich an, bekam dann aber bei jedem Aufruf „nicht angemeldet". Der Demo-Start belebt das Konto wieder.
- Beleg-Scan: Die Vorschau-Summe ist die Summe dessen, was gebucht wird (ein Rabatt in eigener Kategorie zählte doppelt); die Menge lässt sich frei eintippen (`0,345`).
- Bei einem Dauerauftrag lässt sich die Kategorie wieder entfernen.
- Ein gelöschtes Sparziel lässt sich nicht mehr bearbeiten oder abschließen.
### Why
- Die erste Runde hat die Zahlen vereinheitlicht und sechs Punkte als bekannte Grenzen stehen lassen, die eine Produktentscheidung brauchten. Sie sind jetzt so entschieden, wie es im Alltag am wenigsten überrascht: Was die App sagt, lässt sich aus den Buchungen nachrechnen; nichts wird ungefragt in die Vergangenheit gebucht; nichts wird doppelt gebucht; vergangene Monate ändern sich nicht mehr.
### How
- Migration `20261119180000_goal_withdrawals_alert_scope_snapshots`: `Budget.withdrawalTransactionId` und `Budget.reservedCents` (für vorher abgeschlossene Ziele mit ihrem bisherigen Betrag befüllt, damit „Verfügbar" nicht springt), `RecurringTransaction.bookFromPeriod`, `BudgetAlertLog` nach Haushalt und Kategorie, neue Tabelle `BudgetMonthSnapshot`.
- Regeln ergänzt in `docs/calculations/00-grundregeln.md` (§4 und §7); die Seiten 03, 04, 06, 07 und `docs/api-reference.md` sind angepasst.
- Weiterhin so, und in den Erklärungen benannt: Eine Zahlung mit anderem Betrag oder mehr als 7 Tage vom Fälligkeitstag entfernt wird nicht vorgeschlagen; löscht man die Buchung eines Dauerauftrags (auch eine bestätigte), bleibt der Monat ohne Buchung.

## [0.1.8] - 2026-11-19
### Fixed
- **Eine Zahl, eine Bedeutung:** Dashboard, Rückblick, Quartalsübersicht und Jahresübersicht nach Kategorien rechnen jetzt nach denselben Regeln und zeigen für denselben Monat dieselben Beträge. Vorher entschied jede Auswertung selbst, zu welchem Monat eine Buchung gehört und was Einnahme, Ausgabe und Sparen ist.
- **Buchungsliste stimmt mit dem Rückblick überein:** Der Zeitraum-Filter schloss bisher alle Buchungen des letzten gewählten Tages aus, und die Summe „Ausgaben" enthielt Spar-Einzahlungen. Filtert man einen Monat und den Typ „Ausgaben", steht dort jetzt dieselbe Zahl wie im Rückblick. Sparen ist ein eigener Typ-Filter und eine eigene Summe; ein Monat lässt sich direkt auswählen, statt beide Datumsfelder zu füllen. Die Suche findet Beträge auch in der Schreibweise `1.234,56`.
- **Bearbeiten ändert die Kategorie nicht mehr stillschweigend:** Öffnete man eine Spar-Entnahme (oder eine negative Buchung in einer Einnahmen-Kategorie) und speicherte irgendeine Änderung, wechselte die Buchung in die erste Kategorie des „passenden" Typs — und verschob damit Einnahmen und Gespartes des Monats.
- **Monatswechsel um Mitternacht deutscher Zeit:** Tag, Monat und Jahr einer Buchung, „heute" und „aktueller Monat" richten sich überall nach Europe/Berlin. In Produktion (UTC) wechselte der Monat bisher ein bis zwei Stunden zu spät; eine Buchung um 00:30 Uhr am 1. landete im Vormonat, im Steuerjahr entsprechend im Vorjahr.
- **Alle Konten des Haushalts zählen:** Auswertungen, Sparplan und Budget-Warnung lasen bisher nur ein Konto (das erste bzw. das der Buchung). `GET /api/accounts` liefert das älteste Konto zuerst, damit Formulare und Server-Defaults dasselbe Konto meinen.
- **Sparen:** Buchungen einer Spar-Kategorie sind immer Sparen — eine Entnahme (positiver Betrag) ist keine Einnahme mehr, „Gespart" ist netto (Einzahlungen minus Entnahmen). Hat ein Haushalt „Savings" und „Sparen", zählen beide; der Spartopf ist überall dieselbe Zahl.
- **Daueraufträge:** Eine gelöschte automatische Buchung kommt nicht mehr beim nächsten Laden zurück; eine in einen anderen Monat verschobene Buchung führt nicht mehr zu einer zweiten Buchung des ursprünglichen Monats. Wer einen Dauerauftrag ohne Startdatum am Fälligkeitstag anlegt, bekommt die erste Buchung im Folgemonat statt einer zweiten Buchung am selben Tag. Den Tag zu ändern verschiebt den Rhythmus einer Serie nicht mehr. Automatisch gebuchte Vorkommen erben die Steuer-Markierung ihrer Kategorie.
- **Dashboard:** „Ausgegeben" zeigt in der Kennzahl dieselbe Zahl wie im Kopf (ohne Sparen); Fixkosten-Quote und die Summen der Daueraufträge zählen alle im Monat fälligen Daueraufträge und schrumpfen nicht mehr, sobald sie gebucht sind; nach dem Einrichtungs-Assistenten füllt sich die Übersicht sofort (die Daueraufträge starten im laufenden Monat). Kein rotes „-0,00 €" mehr bei exakt aufgebrauchtem Budget; der Kontostand endet am Monatsende (vorerfasste Buchungen späterer Monate zählen nicht); geplante Daueraufträge ohne Kategorie erscheinen in der Kategorien-Aufteilung.
- **Sparplan:** Ein Ziel gilt erst als erreicht, wenn der Betrag voll ist (995 von 1.000 € sind 99 %, nicht 100 %); Kategorie-Budgets tauchen nicht mehr als Sparziele auf; die empfohlene Monatsrate sinkt nicht mehr, sobald man im laufenden Monat spart; gelöschte Buchungen zählen nicht mehr als für ein Ziel ausgegeben.
- **Beleg-Scan:** Ein Gutschein oder Rabatt, der allein in einer Kategorie steht, wird nicht mehr als Ausgabe gebucht; die Buchungen eines Belegs ergeben zusammen die Belegsumme. Das Belegdatum wird als 12:00 Uhr Berliner Zeit des Belegtags gespeichert statt als Mitternacht UTC.
- **Jahresübersicht und CSV-Export der Daueraufträge** ordnen gleich ein (Spar-Kategorie, dann Vorzeichen) — eine Einnahme ohne Kategorie steht im CSV nicht mehr als „Ausgabe". Die Jahresübersicht nach Kategorien ordnet jede Buchung einzeln ein; ihre Monatssummen entsprechen dem Rückblick.
- **Rückblick:** Die Sparquote bleibt zwischen 0 und 100 %; ungültige Monats-/Jahresangaben fallen auf den letzten abgeschlossenen Monat zurück.
- **Budget-Warnung (Push)** rechnet „Ausgegeben" und das Budget wie das Dashboard (Budget-Plan vor Monats-Budget, Monats-Budgets mehrerer Konten zusammen) und meldet eine exakt erreichte Schwelle zuverlässig.
- **Prozentwerte** werden einheitlich kaufmännisch gerundet (`percentOf`): 435 € von 3.000 € sind 15 %, nicht 14 %.
- **Kategorien:** Die Nutzungs-Reihenfolge zählt gelöschte Buchungen nicht mehr mit. Bei einem Dauerauftrag lässt sich die Kategorie wieder entfernen.
- **Eingaben, die sich nicht speichern lassen, sind `400` statt `500`** (Beschreibung oder Titel nur aus Leerraum, Betrag außerhalb int4, unlesbares Datum oder Jahr vor 1900, kein JSON). Die Offline-Outbox hält bei jedem 5xx an — ein solcher Eintrag blockierte bisher alle späteren Offline-Buchungen.
### Added
- `docs/calculations/00-grundregeln.md` — die verbindlichen Regeln für Kalender, Einordnung, Umfang, gebucht/geplant und den Abgleich der Bildschirme; die übrige Berechnungs-Doku und `docs/api-reference.md` sind darauf abgestimmt.
- `@doewe/shared`: `calendar.ts` (`APP_TIME_ZONE`, `zonedMonth`, `zonedDate`, `zonedMonthRange`, `zonedDayRange`, `zonedYearRange`, `zonedTimeToUtc`, `zonedDayKey`, …), `cashflow.ts` (`classifyFlow`, `sumFlows`, `isSavingsCategoryName`, `savingsCategoryIds`) und `transactionFilter.ts` (`filterTransactions`, `listTotals` — Filter und Summen der Buchungsliste); in `recurringSchedule.ts` neu `occurrenceDate`, `isOnOrBeforeDate`, `firstOccurrenceFrom`.
- `Transaction.recurringPeriod` (`JJJJ-MM`): der Monat, für den ein Vorkommen eines Dauerauftrags gebucht wurde. Migration `20261119120000_add_recurring_period` legt die Spalte an, befüllt bestehende Buchungen mit dem Berliner Monat ihres Datums und ersetzt den Index auf `recurringTransactionId` durch `(recurringTransactionId, recurringPeriod)`.
- `GET /api/analytics/summary`: `recurringDueIncomeTotal`, `recurringDueOutcomeTotal`, `recurringDueCount` — alle im Monat fälligen Daueraufträge, ob gebucht oder nicht.
- Abnahmetests `apps/web/tests/reconciliation.test.ts` und `apps/web/tests/recurring.occurrence.test.ts` als ausführbare Fassung der Grundregeln.
### Changed
- `GET /api/analytics/quarterly` und `/category-year` buchen wie `summary` und `monthly-review` vor dem Rechnen verpasste Daueraufträge abgeschlossener Monate nach.
- `loadEffectiveCategoryBudgets` und `loadEffectiveCategoryBudgetsForYear` nehmen keine `accountId` mehr (haushaltsweit); `SAVINGS_CATEGORY_NAMES` und `findSavingsCategoryId` aus `app/api/saving-plan/savings.ts` sind entfernt — die Spar-Kategorien kommen aus `lib/savingsCategory.ts` (`loadSavingsCategoryIds`).
- `computeAvailableBudget` rechnet intern in Cents.
### Why
- Derselbe Monat zeigte je nach Bildschirm andere Beträge: Jede Route bestimmte Monat (Prozess-Zeitzone: UTC in Produktion, Europe/Berlin im Browser), Einordnung und Konto für sich. Zahlen, die sich nicht aufeinander zurückführen lassen, sind für eine Finanz-App nicht tragbar.
### How
- Ein Kalender (`packages/shared/src/calendar.ts`), eine Einordnung (`packages/shared/src/cashflow.ts`: Spar-Kategorie zuerst, dann das Vorzeichen; `Category.isIncome` entscheidet nichts), der Haushalt als Umfang, und ein Vorkommen eines Dauerauftrags als `(recurringTransactionId, recurringPeriod)` statt „eine Buchung in diesem Monat". Zeitpunkte für einen Kalendertag werden als 12:00 Uhr Berliner Zeit gespeichert; bestehende Daten brauchen dafür keine Migration.
- Bewusst unverändert und als bekannte Grenzen dokumentiert: Der Abschluss eines Sparziels erzeugt keine Buchung; Budget-Warnungen lesen nur Monats-Budgets, nie Budget-Pläne; eine von Hand erfasste Zahlung wird nicht als Vorkommen eines Dauerauftrags erkannt; ein Startdatum in der Vergangenheit bucht jeden Monat seither nach; die Monatsanteile eines Jahres-Budgetplans ändern sich, wenn sich Daueraufträge ändern.

## [0.1.7] - 2026-08-21
### Added
- **Steuer-PDF-Export** (`GET /api/tax/export`): Ein-Klick-Export der steuerrelevanten Transaktionen eines Jahres als PDF — Deckblatt (Haushalt, Position/Beleg-Zähler, getrennte Summen für Ausgaben/Einnahmen + Gesamt), nach Kategorie gruppierte Tabelle mit laufender Nummer/Beleg-Referenz und Kategorie-/Jahresgesamtsummen, optionaler Beleganhang (eine Seite pro Beleg). Button + „Belege einbetten"-Checkbox mit Größenvorschau auf `/tax`.
### Changed
- `formatEuro(cents, locale)` in `@doewe/shared` ergänzt (nur vom PDF-Export genutzt); Tax-Kategorie-Gruppierung aus `app/api/tax/route.ts` nach `packages/shared/src/tax.ts` extrahiert (jetzt mit getrennten Einnahmen-/Ausgaben-Summen) und dort unit-getestet.
### Why
- Belege müssen für die Steuererklärung nicht eingereicht, aber vorgehalten werden (Belegvorhaltepflicht) — ein einziges PDF mit Tabelle + Belegen ersetzt manuelles Zusammensuchen einzelner Anhänge.
### How
- `pdf-lib` serverseitig (kein Headless-Chromium nötig, kann fremde PDF-Belege per `copyPages` übernehmen); Belegbytes werden sequenziell einzeln nachgeladen (nie ein `findMany` mit `data`) und bleiben strikt haushaltsgescoped. Hartes 50-MB-Budget für eingebettete Belegbytes → `413` mit `{ error, totalBytes, limitBytes }`. `image/webp`-Belege bekommen eine Platzhalterseite statt Konvertierung; ein defekter Beleg fällt einzeln auf eine Platzhalterseite zurück statt den Export abzubrechen. `StandardFonts.Helvetica` (WinAnsi) mit `sanitizeWinAnsi()`-Fallback (`?`) für nicht kodierbare Zeichen.

## [0.1.6] - 2026-08-13
### Added
- **"Calm Finance" Design-System** — semantische Design-Tokens (Surfaces, Ink, Brand, Income/Expense/Savings, Status) als Tailwind-Klassen, die sich automatisch an Light- und Dark-Mode anpassen. Quelle & Spezifikation in `docs/design/` (`design-system.html`, `claude-design-prompt.md`, Marken-Logos als SVG).
### Changed
- Vollständiger Rollout der Tokens über alle Screens (Dashboard, Transactions, Saving Plan, Review, Categories, Settings, Tax, Login/Auth, Household-Join, Legal) und Komponenten — rohe Tailwind-Farben (`indigo-`, `gray-`, `red-`/`emerald-` etc.) durch Tokens ersetzt, redundante `dark:`-Neutral-Varianten entfernt.
### Why
- Ein ruhiges, konsistentes und WCAG-2.2-AA-taugliches Erscheinungsbild in Light + Dark; ein einziger Token-Satz statt verstreuter Hardcodes.
### How
- Tokens aus CSS-Variablen (RGB-Triplets für `<alpha-value>`), `darkMode: "class"`; Farbentscheidungen kontextsensitiv (finanzielles Rot = `expense`, Formularfehler = `danger`, Budget-Gesundheit = `success`/`warning`).

## [0.1.5] - 2026-08-13
### Added
- **Phase 3b — Zwei-Wege-Sync mit Konfliktbehandlung** (#45): `POST /api/sync/push` (Batch-Ops mit Idempotenz via `mutationId`), `GET /api/sync/pull` (Haushalts-Snapshot mit ETag/304), `GET /api/sync/conflicts` (Konflikt-Journal für UI-Hinweise).
- Soft-Delete-Tombstones (`deletedAt`) und `updatedAt` auf Transaction/Account/Category/RecurringTransaction/Budget für Sync-Konflikterkennung.
- `ConflictLog`-Modell: Last-Write-Wins pro Feld, unterlegene Edits werden journaled; Delete gewinnt gegen Edit.
- Pure Sync-Domänenlogik in `@doewe/shared` (`mergeFields`, `detectFieldConflicts`, `updateBlockedByDelete`) mit Unit-Tests + API-Integrationstests.
### Why
- Mehrere Geräte im Haushalt können offline erfassen/ändern und ohne Datenverlust zusammengeführt werden.
### How
- Prisma Client Extension filtert Tombstones aus normalen Reads; Sync-Routes sehen sie via `findUnique`. Migration `20260813150000_add_sync_columns`.

## [0.1.4] - 2026-08-13
### Added
- **Teil D — Haushalts-Sharing** (#44): Haushalt als Mandanten-Grenze, Rollen (OWNER/MEMBER), Einladungslinks; alle Domänen-Queries scopen über `householdId`.
- **Teil C — Web Push** (#43): Budget-Warnungen, Monats-Review-Erinnerung und Erfassungs-Reminder via Web Push (VAPID).
- **Phase 3a — Offline erfassen** (#42): Outbox mit Client-generierten IDs und Idempotenz-Keys, FIFO-Flush beim Reconnect.
- **Phase 2 — Offline lesen** (#41): TanStack Query + IndexedDB-Persistenz für Read-Modelle.
- **Teil F — Dashboard-Aha-Moment** (#40): Hero-Kennzahl (projiziertes verfügbares Restbudget), KPI-Grid.
- **Phase 1 — PWA-Grundlage** (#38): installierbar mit Manifest, Icons, Service Worker; iOS-Zoom-Fix.
### Why
- Familien teilen einen Haushalt, erfassen unterwegs offline und werden proaktiv an Buchungen/Budgets erinnert — der „60-Sekunden-Aha-Moment" wird zum Kern der App.
### How
- Siehe Plan `Tickets/In-progress/pwa-offline-sync/plans/` und PRs #37–#45.

## [0.1.3] - 2026-08-12
### Added
- Manuell wählbares Buchungsdatum in Create- und Edit-Formularen (#36).
- Optionales Startdatum für wiederkehrende Buchungen + klarerer Intervall-Umschalter (#34).
### Fixed
- Radix-Dialog-A11y-Konsolenwarnungen unterdrückt (#35).

## [0.1.2] - 2026-08-03
### Added
- Toast-Benachrichtigungen und Lade-Spinner als Standard-Feedback-Primitive statt Inline-Status (#30).
- MIT-LICENSE und Security-Policy (#31).
### Changed
- README mit Sektions-Icons und Doku-Link überarbeitet (#33).
- Repo-Hygiene: Python-Cache und lokale Claude-Preview-Config ignoriert (#32).

## [0.1.1] - 2026-07-10
### Added
- **Steuervorbereitung** (#25): Transaktionen für die Steuererklärung vormerken, Belege (Foto/PDF) in PostgreSQL anhängen, `/tax`-Seite mit Jahres-Summen und Beleg-Status.
- Kategorie-Steuer-Flag wirkt rückwirkend auf alle Transaktionen (#26).
- Kategorien-Verwaltung (`/categories`) und Abmelden in Drawer & Sidebar (#28).
### Fixed
- Drawer-Overlay hebt sich korrekt über die mobile Bottom-Navigation (z-index) (#29).
### How
- Steuer-Doku in Architektur, Flows, PRD, README (#27).

## [0.1.0] - 2026-07-06
### Added
- **Authentifizierung**: Passwort zurücksetzen & ändern mit Session-Eviction (#17), Sign-in mit Google (#19).
- Undatierte Sparziele (Ideen-Backlog) und Sparbetrag-Auszahlung (#16).
- Income-by-source-Breakdown in der Monats-Review (#22).
### Fixed
- Passwort-Reset-Seiten von der Auth-Middleware ausgenommen (#18).
- Horizontaler Overflow in den Review-Sektionen (#20).
### How
- E-Mail-Transport und Prod-Migration-Deploy-Doku präzisiert (#21).

## [0.0.30] - 2026-07-08
### Added
- **Starlight-Doku live** auf GitHub Pages inkl. vollständigem Content-Refresh (#23).
### Fixed
- Defekte Mermaid-Sequenzdiagramme repariert (#24).

## [0.0.25] - 2026-06-24
### Added
- Bibliotheks-Integrationen (Charts/Feedback-Libs) (#12).
- Realistische Demo-Daten einer 4-Personen-Familie über 36 Monate (#14).
- Responsives Layout für Tablet und Desktop: persistente Sidebar ab `md` (#15).
- Deployment- & CI-Guide (#13).
### Fixed
- Veraltete Node-Version im Deployment korrigiert (#13).

## [0.0.20] - 2026-02-05
### Added
- `totalBalance`: Gesamtsaldo aller Transaktionen (monatsunabhängig) in `/api/analytics/summary`
- `carryoverFromLastMonth`: Übertrag aus dem Vormonat (Saldo Ende letzter Monat)
- Neue Dashboard-Sektion "Kontostand" mit aktuellem Gesamtstand und Vormonatsübertrag
- API-Tests für die neuen Analytics-Felder
### Why
- Nutzer sehen jetzt ihren tatsächlichen Kontostand unabhängig vom aktuellen Monat
- Transparenz über den Übertrag aus dem Vormonat
### How
- Erweiterte `/api/analytics/summary` um zwei neue Berechnungen
- Neue UI-Sektion in `apps/web/app/page.tsx`
- Lokalisierung in `de.ts` und `en.ts`
- Neuer Test `api.analytics.summary.test.ts`

## [0.0.19] - 2025-11-18
### Fixed
- Switching a transaction from income to outcome no longer fails with a server error.
### Changed
- `TransactionForm` now reselects a valid category whenever the transaction type changes to avoid stale foreign keys.
- Transaction create and update handlers normalize optional category IDs and surface Prisma foreign key issues as 400 responses instead of 500s.
### Why
- Editing an income into an outcome submitted the previous income category, triggering a foreign key violation and 500 response.
### How
- Added a type-aware category fallback in `apps/web/components/TransactionForm.tsx`.
- Updated `apps/web/app/api/transactions/route.ts` and `apps/web/app/api/transactions/[id]/route.ts` to coerce optional categories to `null` and map Prisma errors to client-safe responses.

## [0.0.18] - 2025-11-18
### Added
- Bottom navigation bar with icon links and a prominent add-transaction action overlapping the bar.
- Search field anchored at the top of `/transactions` with a magnifying glass affordance.
### Changed
- `/transactions` opens a creation dialog when visited with `?new=1`, refreshes after create, and dropped the floating filter shortcut.
- Navigation moved from the header to the sticky bottom bar; removed burger menu and textual app title.
- Dashboard spending chart hides slice labels and moves the legend below the chart on small screens for readability.
- Dashboard hero copy trimmed.
### Why
- Improve mobile usability, dedicate primary actions to the bottom nav, and help people find transactions or interpret charts faster.
### How
- Rebuilt the client `Header` as a bottom navigation, wired `/transactions` to react to query params for create mode, and updated Chart.js options to react to viewport size.

## [0.0.17] - 2025-11-18
### Added
- Edit dialog for existing transactions with keyboard focus management.
- Delete confirmation dialog and `DELETE /api/transactions/[id]` route.
- `PATCH /api/transactions/[id]` route to update transaction records.
### Changed
- `TransactionForm` now supports both create and edit flows with improved validation feedback.
- Transactions page uses a mobile-friendly card layout, gear action button, confirmation UI, and refreshes the list after updates with feedback overlays.
### Why
- Allow users to correct or refine individual transactions after they are created.
### How
- Extended `apps/web/app/transactions/page.tsx` with edit state and modal wiring.
- Added `apps/web/app/api/transactions/[id]/route.ts` and shared schema for validation.
- Refactored `apps/web/components/TransactionForm.tsx` to handle edit mode and better error handling.

## [0.0.16] - 2025-11-11
### Added
- Budgets page `/budgets` with Tailwind-styled form and list.
- API routes for Budgets and Recurring Transactions using Prisma + Zod.
- Transactions form now includes Account and Category selects.
### Changed
- Prisma schema extended for `Budget` and `RecurringTransaction` (frequency as string for SQLite).
### Why
- Cover core planning features (budgets) and recurring expenses; improve UX with selects.
### How
- Added page at `apps/web/app/budgets/page.tsx`.
- API handlers at `apps/web/app/api/budgets/route.ts` and `apps/web/app/api/recurring-transactions/route.ts`.
- Schema updates under `apps/web/prisma/schema.prisma`.

## [0.0.15] - 2025-10-19
### Added
- Tailwind CSS setup (config, PostCSS, plugin forms) in `apps/web`.
- Accessibility enhancements (skip link, semantic landmarks).
### Changed
- Transactions page refactored to Tailwind (removed inline styles).
- README trimmed to expert-standard overview (moved detailed scope to requirements doc).
### Why
- Align implementation with documented mobile-first & Tailwind guidelines; reduce duplication in docs.
### How
- Added `tailwind.config.ts`, `postcss.config.cjs`, updated `globals.css`, refactored pages/layout, pruned README.

## [0.0.14] - 2025-10-19
### Changed
- Translated README to English (content preserved for review).
- Cleaned Next.js guidelines by removing restrictive sections that blocked autonomous changes.
### Why
- Align documentation language and enable faster implementation without artificial blockers.
### How
- Updated [README.md](README.md) and revised [.github/nextjs.instructions.md](.github/nextjs.instructions.md).

## [0.0.13] - 2025-10-19
### Changed
- GitHub guidelines translated to English; added mobile‑first approach and Tailwind usage; relaxed iteration constraints (quality‑first).
### Added
- Project requirements document at `project-requirements-document.md`.
### Why
- Align collaboration and coding standards with planned UI direction and styling choices; capture requirements centrally.
### How
- Updated [.github/github-instructions.md](.github/github-instructions.md); created `project-requirements-document.md`.

# Changelog

All notable changes to this project will be documented in this file.

## [0.0.12] - 2025-10-19
### Added
- Prisma + SQLite persistence in web: schema, client, seed.
- Transactions API now uses Prisma with Zod validation.
### Changed
- Next config transpiles `@doewe/shared`.
- CI runs `db:push` before tests.
### Why
- Persist data beyond reloads and keep shared domain usable in the app.
### How
- Added schema/seed under [apps/web/prisma](apps/web/prisma), API at [apps/web/app/api/transactions/route.ts](apps/web/app/api/transactions/route.ts), singleton client [apps/web/lib/prisma.ts](apps/web/lib/prisma.ts), CI hook in [.github/workflows/ci.yml](.github/workflows/ci.yml).

## [0.0.11] - 2025-10-19
### Added
- Minimal in-memory Transactions Slice in web: API (GET/POST at /api/transactions) und UI (/transactions) basierend auf shared Domain.
- Workspace-Integration von @doewe/shared und Next transpilePackages.
### Changed
- Shared: package.exports/types gesetzt zur Modulauflösung in Next.
- Lint-Fixes in shared (Imports, unused param) und neue lint:fix-Skripte.
- Repo: .nvmrc=20 hinzugefügt und @typescript-eslint auf v7 aktualisiert (keine TS 5.6 Warnung).
### Why
- Frühe End-to-End Validierung der Domain im UI.
### How
- API-Route apps/web/app/api/transactions/route.ts, UI-Seite apps/web/app/transactions/page.tsx.
- Abhängigkeiten/Config aktualisiert (apps/web/package.json, apps/web/next.config.mjs, packages/shared/package.json).

## [0.0.10] - 2025-10-19
### Added
- Domain foundation in shared: money value object [`packages/shared/src/money.ts`](packages/shared/src/money.ts) and transaction model [`packages/shared/src/domain.ts`](packages/shared/src/domain.ts).
- Tests: [`packages/shared/src/money.test.ts`](packages/shared/src/money.test.ts), [`packages/shared/src/domain.test.ts`](packages/shared/src/domain.test.ts).
### Why
- Typ-sichere Beträge in Cent und validierte Transaktionen als Basis für weitere Features.
### How
- Branded Types, Parser/Formatter, Konstruktor mit Validierung auf Basis von [`packages/shared/src/strings.ensureNonEmpty`](packages/shared/src/strings.ts).

## [0.0.9] - 2025-10-19
### Fixed
- CI triggers on all branches and can be started manually.
### Why
- Push to non-main branch (commit 4347575) didn’t match `branches: [main, master]`, so no workflow ran.
### How
- Broadened triggers in [.github/workflows/ci.yml](.github/workflows/ci.yml) to `"**"`; added `workflow_dispatch`.

## [0.0.8] - 2025-10-19
### Fixed
- Vitest Test-Erkennung im Monorepo: Konfiguration angepasst, damit Tests sowohl vom Repo-Root als auch aus Workspaces gefunden werden.
### Why
- `vitest run` beendete mit Code 1: "No test files found".
### How
- `vitest.config.ts` aktualisiert: explizites `root` gesetzt und `include`-Pattern erweitert.

## [0.0.7] - 2025-10-19
### Added
- Vitest root config [vitest.config.ts](vitest.config.ts).
- Sample test in shared: [packages/shared/src/strings.test.ts](packages/shared/src/strings.test.ts) for [`packages/shared/src/strings.ensureNonEmpty`](packages/shared/src/strings.ts).
### Changed
- [`packages/shared/package.json`](packages/shared/package.json) test scripts now run Vitest.
- CI now executes real tests via `npm run test -ws`.
### Why
- Aktive Tests im Monorepo, ausgeführt in CI.
### How
- Vitest als Dev‑Dependency im Root, Root‑Config erstellt, Beispieltest implementiert und Scripts angepasst.

## [0.0.6] - 2025-10-19
### Added
- Minimal CI Workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) running lint, typecheck, test, build on push/PR with Node from [.nvmrc](.nvmrc).
### Why
- Automatisches Qualitäts-Gate für alle PRs/Commits.
### How
- GitHub Actions mit actions/setup-node (npm cache), Workspaces‑Skripte ausgeführt.

## [0.0.5] - 2025-10-19
### Added
- Zentrale ESLint-Basis unter `shared/eslint/eslint.base.cjs`.
- Paket-spezifische ESLint-Konfigurationen in `apps/web` und `packages/shared`, die die Basis erben.
### Changed
- Lint-Skripte auf ESLint-CLI vereinheitlicht (`eslint .`).
- Root-DevDependencies für ESLint/Plugins hinzugefügt.
### Why
- Einheitliche Lint-Regeln ohne Prettier, einfache Wiederverwendung im Monorepo.
### How
- Base-Config erstellt, Package-Configs angepasst, Skripte und DevDeps aktualisiert.

## [0.0.4] - 2025-10-19
### Added
- Zentrale TypeScript-Basis `shared/tsconfig/tsconfig.base.json`.
- `apps/web` und `packages/shared` vererben auf die Basiskonfiguration.
### Changed
- Root-Skripte auf Workspaces (`-ws`) umgestellt.
### Why
- Einheitliche, strikte TS-Regeln; ein Kommando für Typprüfung aller Pakete.
### How
- Basistsconfig angelegt, Projekt-tsconfigs angepasst, Scripts aktualisiert.

## [0.0.3] - 2025-10-19
### Changed
- README strukturiert überarbeitet (Ziele, Setup, Qualität, Sicherheit, nächste Schritte).
- Copilot‑Richtlinien in `.github/github-instructions.md` bereinigt, konsolidiert und auf Deutsch.
### Why
- Klarere Onboarding‑Dokumentation, weniger Redundanz, eindeutige Qualitätsbarrieren.
### How
- Inhalte umgeordnet, Duplikate entfernt, Formulierungen vereinheitlicht, Beispiele konkreter gefasst.

## [0.0.2] - 2025-10-19
### Fixed
- Replaced Next.js config with `next.config.mjs` (was `next.config.ts`) in `apps/web`.
### Why
- Next 14 does not support TypeScript config files.
### How
- Removed `apps/web/next.config.ts`, added `apps/web/next.config.mjs`.

## [0.0.1] - 2025-10-19
### Added
- Scaffolded Next.js (App Router, TypeScript) in `apps/web` with dev/build/lint/typecheck.
- Added root script `dev:web` to run the web app.
### Why
- Start MVP UI schnell nutzbar machen.
### How
- Added Next, React deps, TS config, basic pages/layout/styles.

## [0.0.0] - 2025-10-19
### Added
- Initial repository structure: monorepo workspaces, placeholder scripts, .editorconfig, .gitignore, .npmrc.
- Created `apps/web` and `packages/shared` packages with minimal package.json.
- Added `monorepoTimeline.md` and this changelog.

