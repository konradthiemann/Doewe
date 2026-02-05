# ToDos

## ✅ Allgemeine Bedingungen für jede Task
- [ ] **Tests müssen grün sein** (`npm test` erfolgreich)
- [ ] **Lint & Typecheck grün** (`npm run lint && npm run typecheck`)
- [ ] **Lokal getestet** (App startet und Feature funktioniert)
- [ ] **Auf develop gemerged und validiert** bevor nächste Task beginnt

---

## ✅ !Der Übertrag auf den nächsten Monat funktioniert nicht. 
**Status: ABGESCHLOSSEN** ✅

- Der aktuelle finanzielle Stand muss natürlich unabhängig vom Monat angezeigt werden. Also als allgemeinen Wert.
- Wie viel Geld vom letzten Monat in den aktuellen Monat übernommen wurde soll als Information auf dem Dashboard zu sehen sein.

### Ablaufplan
1. **Analyse**: API-Route `/api/analytics/summary` untersuchen – wie wird der aktuelle Stand berechnet?
2. **Schema prüfen**: Gibt es ein Feld für "Gesamtstand" oder wird alles aus Transaktionen aggregiert?
3. **API erweitern**: Neuen Endpoint oder Erweiterung von `/api/analytics/summary`:
   - `totalBalance`: Summe aller Transaktionen (unabhängig vom Monat)
   - `carryoverFromLastMonth`: Saldo Ende Vormonat
4. **Dashboard UI**: Neue Karten/Sections für:
   - "Aktueller Kontostand" (gesamt)
   - "Übertrag aus Vormonat"
5. **Lokalisierung**: Texte in `de.ts` und `en.ts` ergänzen
6. **Tests**: API-Tests für neue Felder
7. **Branch**: `fix/monthly-carryover`

---

## Auswahl Transaktionen 
- am meisten benutzt aufsteigend anzeigen
- kleine suchleiste in der Auswahl der Transaktionen einbinden um nach einer bestimmten Transaktion zu suchen

### Ablaufplan
1. **Analyse**: Welche "Auswahl" ist gemeint? → Vermutlich Kategorie-/Beschreibungs-Dropdown in TransactionForm
2. **Nutzungshäufigkeit tracken**: 
   - Client-seitig aus Transaktionshistorie berechnen
3. **API anpassen**: Sortierung nach Häufigkeit in `/api/categories` oder neuem Endpoint
4. **Such-Input**: Filterbare Dropdown-Komponente mit Suchfeld erstellen
5. **UI**: TransactionForm erweitern mit durchsuchbarem Select
6. **Lokalisierung**: Placeholder-Texte
7. **Branch**: `feat/transaction-selection-search`

---

## Wiederkehrende Transaktionen 
- sollen bearbeitet werden können (CRUD)
- sollen auf den Tag genau eingestellt werden können

### Ablaufplan
1. **Schema erweitern**: `RecurringTransaction` um `dayOfMonth` (1-31) erweitern
2. **Migration**: Prisma-Migration erstellen und testen (lokal + prod-kompatibel)
3. **API CRUD vervollständigen**:
   - `GET /api/recurring-transactions/[id]` – einzelne lesen
   - `PUT /api/recurring-transactions/[id]` – aktualisieren
   - `DELETE /api/recurring-transactions/[id]` – löschen (existiert ggf. schon)
4. **RecurringTransactionForm**: Edit-Modus hinzufügen, Tag-Auswahl (1-31)
5. **UI auf Transactions-Page**: Edit-Button pro wiederkehrende Transaktion
6. **Validierung**: Tag muss zwischen 1-31 liegen; Edge-Cases (z.B. 31. Februar)
7. **Lokalisierung**: Neue Texte
8. **Tests**: CRUD-Tests für API
9. **Branch**: `feat/recurring-crud-dayofmonth`

---

## Kategorien 
- sollen bearbeitet werden können (CRUD)

### ⚠️ Sonderregel: Kategorie "Savings/Sparen"
Die Kategorie **"Savings"** (EN) / **"Sparen"** (DE) ist eine **statische System-Kategorie**, die:
- **NICHT umbenannt** werden darf
- **NICHT gelöscht** werden darf
- **NICHT mit anderen Kategorien zusammengeführt** werden darf
- Automatisch den korrekten Namen basierend auf der gewählten Locale anzeigt

**Grund**: An dieser Kategorie hängen zentrale Funktionalitäten (Sparziele, Saving-Plan).

### Ablaufplan
1. **Bestandsanalyse**: Settings-Page hat bereits Rename/Merge/Delete – was fehlt?
2. **Create**: "Neue Kategorie"-Button auf Settings-Page oder eigener Dialog
3. **API prüfen**: 
   - `POST /api/categories` – existiert
   - `PUT /api/categories/[id]` – für Rename (existiert als PATCH?)
   - `DELETE /api/categories/[id]` – existiert
4. **Savings-Schutz implementieren**:
   - Backend: API-Validierung verhindert CRUD auf Savings-Kategorie
   - Frontend: Edit/Delete-Buttons für Savings ausblenden oder deaktivieren
   - Locale-basierte Anzeige: "Savings" ↔ "Sparen"
5. **UI vervollständigen**: Einheitliche CRUD-Oberfläche in Settings
6. **Validierung**: Eindeutige Namen, nicht leer, keine Kollision mit "Savings/Sparen"
7. **Lokalisierung**: Fehlende Texte
8. **Branch**: `feat/categories-crud`

---

## Ziele/Goals
- sollen bearbeitet werden können (CRUD)

### Ablaufplan
1. **Analyse**: Saving-Plan-Page zeigt Goals – wie werden sie erstellt/bearbeitet?
2. **API CRUD vervollständigen**:
   - `GET /api/saving-plan/[id]` – einzelnes Goal lesen
   - `PUT /api/saving-plan/[id]` – aktualisieren
   - `DELETE /api/saving-plan/[id]` – löschen
3. **PlannedSavingForm**: Edit-Modus hinzufügen
4. **UI auf Saving-Plan-Page**: Edit/Delete-Buttons pro Goal
5. **Bestätigungsdialog**: Vor Löschen warnen
6. **Lokalisierung**: Neue Texte
7. **Tests**: CRUD-Tests
8. **Branch**: `feat/goals-crud`

---

## Quartalsübersicht auf dem Dashboard

### Ablaufplan
1. **Design**: Welche Daten? → Einnahmen/Ausgaben/Saldo pro Monat, 3-Monats-Vergleich
2. **API erweitern**: `/api/analytics/quarterly` oder Parameter in `/api/analytics/summary`
3. **Datenstruktur**: 
   ```ts
   { quarters: [{ month, year, income, outcome, balance }] }
   ```
4. **UI-Komponente**: Quartalsübersicht-Karte mit Bar-Chart oder Tabelle
5. **Chart.js Integration**: Gruppiertes Balkendiagramm (Income/Outcome pro Monat)
6. **Responsive**: Mobile-first, Chart skaliert
7. **Lokalisierung**: Überschriften, Labels
8. **Branch**: `feat/quarterly-overview`

---

## Transaktionen nach Einnahmen/Ausgaben filtern 

### Ablaufplan
1. **UI**: Filter-Buttons/Tabs auf Transactions-Page ("Alle", "Einnahmen", "Ausgaben")
2. **State**: `filterType: 'all' | 'income' | 'outcome'`
3. **Filterlogik**: Client-seitig filtern (`amountCents > 0` = Einnahme, `< 0` = Ausgabe)
4. **URL-State**: Filter in Query-Params speichern für Bookmarkability
5. **Styling**: Aktiver Filter visuell hervorgehoben
6. **Lokalisierung**: Button-Labels
7. **Branch**: `feat/filter-income-outcome`

---

## Eingabefeld Betrag
- Wie darf eingetragen werden? mit "," oder mit "." (12.34) und/oder (12,34)
- Wird das validiert?

### Ablaufplan
1. **Analyse**: `parseCents` in `@doewe/shared` prüfen – was wird akzeptiert?
2. **Anforderung definieren**: 
   - Deutsche Eingabe: `12,34` → 1234 Cents
   - Englische Eingabe: `12.34` → 1234 Cents
   - Beides erlauben? → Ja, locale-aware
3. **Parser erweitern**: `parseCents` soll beide Formate akzeptieren
4. **Validierung**: Fehlermeldung bei ungültigem Format
5. **Hinweistext**: Placeholder zeigt erlaubtes Format (`z.B. 12,34 oder 12.34`)
6. **Unit-Tests**: Alle Formate testen
7. **Lokalisierung**: Fehlermeldungen
8. **Branch**: `fix/amount-input-validation`

---

## Light Theme
- Einbau eines light themes
- Auswahlmöglichkeit des Themes in den Einstellungen
- Stichworte: Zen, Minimalistisch, übersichtlich, alle relevante Informationen.

### Ablaufplan
1. **Tailwind Config**: Dark-Mode-Strategie auf `class` setzen (falls nicht schon)
2. **Theme-Context**: React Context für Theme-State (`light` | `dark` | `system`)
3. **LocalStorage**: Theme-Präferenz persistieren
4. **CSS-Variablen**: Farbpalette für Light-Theme definieren (Zen, minimalistisch)
5. **Komponenten prüfen**: Alle `dark:` Klassen haben Light-Äquivalent
6. **Settings-UI**: Theme-Auswahl (Radio-Buttons oder Dropdown)
7. **System-Preference**: `prefers-color-scheme` respektieren bei "System"
8. **Lokalisierung**: Theme-Option-Labels
9. **Branch**: `feat/light-theme`