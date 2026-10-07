# Spec: Rückblick-Verbesserungen, Budgets, Jahresübersicht, Transaktion → wiederkehrend

Status: **Freigegeben (2026-10-07)**

Entscheidungen: Listen einzeilig für Daueraufträge UND Transaktionen; eigene Nav-Seiten `/yearly` und `/budgets`; Fixkosten = alle wiederkehrenden Ausgaben; neues Modell ersetzt alte Monatsbudgets als Quelle (alte Zeilen bleiben Monats-Override); offene Fragen 1–3 mit Vorschlägen beantwortet. Offline-Sync der Budget-Pläne als späterer Slice 5c; Budget-Warnungen bewusst zurückgestellt.

## Problem / Ziel
Die Listen sind auf Desktop unnötig hoch, der Rückblick zeigt bei „Ausgaben nach Kategorie" ohne Budget lauter volle Balken (keine Aussage), Nebeninfos nehmen Platz weg, und es fehlt eine sinnvolle Budget-Verwaltung sowie ein Jahresblick auf Wiederkehrendes. Zielgruppe: Paare/Familien, die monatlich Rückblick machen.

## Slices (unabhängig lieferbar, in dieser Reihenfolge)
1. **UI-Politur** (A1, A3) — rein Frontend
2. **Rückblick Kategorien** (A2) — Frontend + Erweiterung monthly-review-API
3. **Transaktion → wiederkehrend** (A6) — API + UI
4. **Jahresübersicht wiederkehrend** (A4) — neue Seite + API
5. **Budgets** (A5) — neues Modell, neue Seite, Rückblick/Dashboard-Anbindung

## User Stories
- Als Nutzer sehe ich auf dem Desktop jeden Dauerauftrag und jede Transaktion in **einer Zeile**, damit ich mehr auf einmal überblicke.
- Als Nutzer kann ich im Rückblick jede Kategorie **aufklappen** und die Einzelbuchungen sehen.
- Als Nutzer sehe ich im Rückblick Balken, die etwas aussagen (Anteil an den Gesamtausgaben bzw. Budgetauslastung).
- Als Nutzer sind „Top Ausgaben" und „Einnahmen nach Quelle" standardmäßig eingeklappt.
- Als Nutzer sehe ich eine **Jahresübersicht** meiner wiederkehrenden Einnahmen/Ausgaben.
- Als Nutzer lege ich **Budgets** je Kategorie fest (monatlich fix oder jährlich) und sehe sie als Fortschrittsbalken in voller Breite im Rückblick.
- Als Nutzer kann ich eine bestehende Einzeltransaktion nachträglich zu einem Dauerauftrag machen.

## Akzeptanzkriterien

### A1 — Einzeilige Listen (Desktop)
- [ ] Ab Breakpoint `lg` zeigt jede Dauerauftrag-Karte Name, Intervall, „Nächste", Kategorie, Betrag, Edit-Button in **einer** Zeile (kein Umbruch bei typischen Texten; lange Namen werden mit `truncate` gekürzt, `title`-Tooltip).
- [ ] Gleiches gilt für Zeilen der normalen Transaktionsliste.
- [ ] Unter `lg` (Mobil/Tablet) bleibt das bisherige mehrzeilige Layout unverändert.
- [ ] Das Zwei-Spalten-Raster der Dauerauftragsliste entfällt auf Desktop zugunsten einer Spalte (sonst nicht einzeilig darstellbar).

### A2 — Rückblick: Ausgaben nach Kategorie
- [ ] Jede Kategorie ist per Klick/Tastatur (Button, `aria-expanded`) aufklappbar; aufgeklappt erscheinen die Einzelbuchungen dieser Kategorie im Monat (Datum, Beschreibung, Betrag), absteigend nach Betrag. Standard: zugeklappt.
- [ ] `GET /api/analytics/monthly-review` liefert pro Kategorie zusätzlich `transactions: Array<{ id, description, amountCents, occurredAt }>` (Ausgaben, ohne Spar-Kategorie, ohne Soft-Deletes).
- [ ] Ohne Budget: Balken = Anteil der Kategorie an den Gesamtausgaben des Monats (`spent / outcomeCents`), daneben Prozentzahl; **nicht mehr** 100 % für alle. Die größte Kategorie ist nicht automatisch voll.
- [ ] Mit Budget: Balken = Auslastung `spent / budget` (über 100 % gedeckelt dargestellt, rot, Hinweis „X über Budget").
- [ ] Der Abschnitt nutzt die volle verfügbare Breite (`col-span-full`/eigene Zeile über beiden Spalten), nicht nur eine Hälfte des 2-Spalten-Grids.
- [ ] Transaktionen ohne Kategorie erscheinen unter „Ohne Kategorie" und sind ebenfalls aufklappbar.

### A3 — Rückblick: einklappbare Nebenabschnitte
- [ ] „Top Ausgaben" und „Einnahmen nach Quelle" sind standardmäßig **eingeklappt** (`<details>` bzw. Button mit `aria-expanded`), Überschrift bleibt sichtbar, Inhalt per Klick.
- [ ] Zustand wird nicht persistiert (bei jedem Laden wieder zu).

### A4 — Jahresübersicht Wiederkehrendes
- [ ] Neue Seite `/yearly` (Nav-Eintrag in Sidebar + mobiler Navigation; i18n de/en).
- [ ] Zeigt für ein wählbares Jahr (Default: aktuelles) eine Tabelle: Zeilen = vorhandene Daueraufträge (nur angelegte; leere Ansicht mit Hinweis, wenn keine), Spalten = Jan–Dez + Jahressumme; Einnahmen und Ausgaben getrennt gruppiert, mit Summen und Saldo je Monat.
- [ ] Ein Dauerauftrag erscheint nur in den Monaten, in denen er fällig ist (`intervalMonths`, Anker `nextOccurrence`, über dieselbe Logik wie `dueMonthsBetween` in `@doewe/shared`); übersprungene Monate (`RecurringTransactionSkip`) werden nicht gezählt; Soft-Deleted ausgeschlossen.
- [ ] Neuer Endpoint `GET /api/recurring-transactions/yearly?year=YYYY` liefert die Matrix serverseitig (Haushalts-Scoping, Demo-Account-Regeln beachtet).
- [ ] Domain-Logik (Monatsmatrix) als reine Funktion in `@doewe/shared`.
- [ ] Mobil: horizontal scrollbare Tabelle mit sticky erster Spalte.

### A5 — Budgets
- [ ] Neue Seite `/budgets` (ersetzt den Redirect auf `/saving-plan`), Nav-Eintrag.
- [ ] Neues Datenmodell `CategoryBudgetPlan`: `{ id, householdId/accountId, categoryId, period: MONTHLY | YEARLY, amountCents, deletedAt }`, genau ein aktiver Plan je Kategorie (Unique). CRUD-API `/api/budget-plans` (+ `[id]`), Zod-Validierung, Haushalts-Scoping, Beträge als Integer-Cent.
- [ ] **MONTHLY:** fixer Monatswert = `amountCents`.
- [ ] **YEARLY:** Monatswert für Monat *m* = `round(yearlyCents × available_m / Σ available_1..12)`, wobei `available_m` = erwartete Einnahmen des Monats − wiederkehrende Ausgaben („Fixkosten") des Monats, jeweils aus den Daueraufträgen des Jahres (Quelle: A4-Matrix). Monate mit `available_m ≤ 0` bekommen 0; ist die Summe aller `available` ≤ 0, wird gleichmäßig durch 12 geteilt. Die Summe der 12 Monatswerte ergibt **exakt** `yearlyCents` (Rundungsrest auf den Monat mit dem größten Anteil).
- [ ] Reine Funktion `distributeYearlyBudget(yearlyCents, availablePerMonth[12]) → number[12]` in `@doewe/shared`.
- [ ] Budgets-Seite: Liste je Kategorie mit Auswahl monatlich/jährlich, Betrag, bei jährlich Vorschau der 12 Monatswerte; Anlegen/Ändern/Löschen.
- [ ] Rückblick: Abschnitt „Ausgaben nach Kategorie" nutzt für den Monat den effektiven Budgetwert (Plan; ein evtl. vorhandenes altes Monats-`Budget` für genau diesen Monat überschreibt ihn) und zeigt Fortschrittsbalken in voller Breite (siehe A2).
- [ ] Dashboard-„Kategorie-Budgets" (`analytics/summary`) nutzt dieselbe Ermittlung (gemeinsame Funktion), damit beide Ansichten identische Werte zeigen.
- [ ] Bestehende `Budget`-Zeilen mit Kategorie bleiben unverändert erhalten (keine Datenmigration/-löschung); Sparziele (`categoryId = null`) sind nicht betroffen.

### A6 — Transaktion nachträglich wiederkehrend machen
- [ ] In der Bearbeitung einer Einzeltransaktion gibt es die Aktion „Als wiederkehrend festlegen" mit Intervall (1/3/6/12 Monate oder frei 1–24) und Starttag (Default: Tag der Buchung).
- [ ] Neuer Endpoint `POST /api/transactions/[id]/make-recurring` `{ intervalMonths }` legt einen `RecurringTransaction` aus Betrag/Beschreibung/Kategorie/Konto der Buchung an; `nextOccurrence` = Buchungsdatum + `intervalMonths` (nächste Fälligkeit **nach** dieser Buchung).
- [ ] Die Ursprungsbuchung wird mit `recurringTransactionId` verknüpft, damit der Auto-Buchungslauf (`materializeDueRecurringTransactions`) diesen Monat nicht doppelt bucht.
- [ ] Ist die Transaktion bereits verknüpft → 409. Fremder Haushalt/Soft-Deleted → 404. Ohne Session → 401.
- [ ] Nach Erfolg: Toast, Dauerauftragsliste (`["recurring"]`) wird invalidiert.

## Out of Scope
- Automatisches Erkennen wiederkehrender Muster.
- Budget-Benachrichtigungen (`budgetAlerts.ts`) auf neues Modell umstellen — separater Schritt.
- Mehrjahres- oder Kontenübergreifende Budgets, Budgets pro Person.
- Änderungen an Sparplan/Sparzielen.
- Persistenz des Auf-/Zuklappzustands.
- Datenmigration alter Monatsbudgets in das neue Modell.

## Offene Fragen
1. A5: Sollen „Einnahmen" für `available_m` nur wiederkehrende Einnahmen zählen (planbar, Vorschlag) oder zusätzlich der Durchschnitt gebuchter Einnahmen der Vorjahresmonate?
2. A5: Soll die Spar-Kategorie (`savings`/`sparen`) budgetierbar sein? (Vorschlag: nein, ausgeblendet.)
3. A4: Jahressumme der Einnahmen/Ausgaben auch als Monatsdurchschnitt anzeigen? (Vorschlag: ja, eine Zeile.)
4. A2: Kategoriename „Fixkosten" erscheint in Screenshot 1 noch als „Fixed costs" (Englisch) — Absicht (Nutzerdaten) oder unabhängiger i18n-Bug? Wird hier nicht behoben.
