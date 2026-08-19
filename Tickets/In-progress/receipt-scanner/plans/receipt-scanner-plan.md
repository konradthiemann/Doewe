# Feature-Plan: Kassenbeleg-Scanner mit automatischer Kategorisierung (Issue #51)

## 1. Uebersicht

**Ziel:** Kassenbeleg fotografieren -> OCR erkennt Positionen + Preise -> KI ordnet Kategorien zu -> User prueft/korrigiert in Review-Maske -> Bestaetigung erzeugt gruppierte Transaktionen (z.B. 1x Groceries 47,30 EUR mit Einzelpositionen, 1x Geschenke 5,99 EUR).

**Ergebnis:** Pro Kategorie eine Transaktion mit den summierten Positionen. Die Einzelpositionen werden als Metadaten gespeichert (Transparenz & Nachvollziehbarkeit).

---

## 2. Tool-Recherche: Kostenlose OCR-Optionen

| Tool | Typ | Kosten | Line-Item-Qualitaet | Empfehlung |
|------|------|--------|-------------------|------------|
| **Tesseract.js** | Client-side, Open Source | Kostenlos, keine API-Limits | Rohtext -- Parsing muss selbst gebaut werden (~60-70% Genauigkeit bei Bons) | Fallback |
| **OCR.space** | Cloud API, Free Tier | 25.000 Req/Monat, 500/Tag, 1MB Limit | Text + Receipt-Modus, aber kein strukturiertes Line-Item-JSON | Mittel |
| **Google Cloud Vision** | Cloud API | 1.000 Req/Monat gratis + $300 Startguthaben | Sehr guter OCR-Text, aber kein Receipt-spezifisches Parsing | Gut fuer OCR |
| **Claude Vision (Sonnet)** | LLM Vision API | ~$3/$15 pro 1M Tokens (~0.3ct pro Beleg) | Versteht Kontext, liefert strukturiertes JSON mit Positionen + Preisen direkt | **Beste Option** |
| **Mindee** | Receipt-OCR SaaS | 250 Req/Monat gratis | Spezialisiert auf Bons, strukturiertes JSON mit Line Items | Alternative |

### Empfehlung: Zweistufiger Ansatz

1. **Primaer: Claude Vision API (Sonnet 4.6)** -- Bild -> strukturiertes JSON mit Positionen, Preisen, Kategorievorschlaegen. Keine separate OCR-Bibliothek noetig, versteht deutsche Bons, liefert direkt das gewuenschte Format. Kosten: ~0.2-0.5 Cent pro Beleg.
2. **Fallback: Tesseract.js (client-side)** -- Offline-faehig, kostenfrei, aber nur Rohtext -> eigener Parser noetig, geringere Qualitaet.

**Warum Claude Vision statt klassischer OCR:**
- Klassisches OCR (Tesseract, Google Vision) liefert nur **Rohtext** -- man muss selbst regexen/parsen um Positionen, Preise, Rabatte zu erkennen
- Claude Vision versteht **Kontext**: "2x Milch 1,49" -> `{name: "Milch", qty: 2, unitPrice: 149, total: 298}`
- Kann direkt **Kategorie-Vorschlaege** machen basierend auf den existierenden User-Kategorien
- Versteht deutsche Bons (ALDI, REWE, Lidl, dm etc.) nativ

### Quellen
- Eden AI -- Top Free Receipt Parser APIs: https://www.edenai.co/post/top-free-ocr-receipt-parser-apis-and-open-source-models
- OCR.space -- Free OCR API: https://ocr.space/ocrapi (25k Req/Monat frei)
- Tesseract.js -- Pure JS OCR: https://tesseract.projectnaptha.com/
- Google Cloud Vision OCR: https://cloud.google.com/use-cases/ocr (1.000 Req/Monat frei)
- Claude Vision API Guide 2026: https://topictrick.com/blog/claude-vision-image-pdf-analysis
- Mindee Receipt OCR: https://www.mindee.com/product/receipt-ocr-api (250 Req/Monat frei)
- Yomio OCR Receipt Scanner API Comparison 2026: https://yomio.app/en/blog/ocr-receipt-scanner-api

---

## 3. Architektur

```
+-----------------------------------------------------+
|  Mobile/Desktop UI                                   |
|                                                      |
|  [Kamera / Datei] -> Bild-Preview + Kompression      |
|       |                                              |
|       v                                              |
|  POST /api/receipt-scan                              |
|       |                                              |
|       v                                              |
|  Server: Bild -> Claude Vision API                   |
|       |  (Prompt: "Extrahiere alle Positionen...")    |
|       |                                              |
|       v                                              |
|  JSON: { merchant, date, items: [{name, qty,         |
|          unitPrice, total, suggestedCategory}],       |
|          subtotal, tax, total }                      |
|       |                                              |
|       v                                              |
|  Review-Maske (Client)                               |
|  +---------------------------------------------+    |
|  | REWE - 19.08.2026                            |    |
|  |                                              |    |
|  | Pos.  Artikel        Preis   Kategorie       |    |
|  | 1     Milch 3,5%     1,49    [Groceries v]   |    |
|  | 2     Schokolade     2,99    [Geschenke v]   |    |
|  | 3     Brot           3,49    [Groceries v]   |    |
|  | 4     Spuelmittel    1,99    [Haushalt  v]   |    |
|  |                                              |    |
|  | Summe: 9,96 EUR                              |    |
|  |                                              |    |
|  | Gruppierung nach Kategorie:                  |    |
|  |   Groceries:  4,98 EUR (Milch, Brot)        |    |
|  |   Geschenke:  2,99 EUR (Schokolade)         |    |
|  |   Haushalt:   1,99 EUR (Spuelmittel)        |    |
|  |                                              |    |
|  |        [Abbrechen]  [Buchen]                 |    |
|  +---------------------------------------------+    |
|       |                                              |
|       v                                              |
|  POST /api/transactions/batch                        |
|  -> 1 Transaktion pro Kategorie-Gruppe               |
|  -> Beleg-Foto als Attachment an jede Transaktion     |
|  -> Einzelpositionen als ReceiptLineItem              |
+-----------------------------------------------------+
```

---

## 4. Datenmodell-Erweiterungen

### 4a. Neues Prisma-Model: ReceiptLineItem

```prisma
model ReceiptLineItem {
  id            String   @id @default(cuid())
  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  name          String       // "Milch 3,5%"
  quantity      Int    @default(1)
  unitPriceCents Int         // 149
  totalCents    Int          // 149
  position      Int          // Reihenfolge auf dem Beleg
  createdAt     DateTime @default(now())

  @@index([transactionId])
}
```

**Warum eigenes Model statt JSON-Feld:**
- Abfragbar (z.B. "Was habe ich letzten Monat fuer Milch ausgegeben?")
- Validierbar auf DB-Ebene
- Erweiterbar (z.B. EAN-Code, Mengeneinheit)

### 4b. Transaction-Model Ergaenzung

```prisma
model Transaction {
  // ... bestehende Felder
  receiptLineItems ReceiptLineItem[]
  receiptMerchant  String?           // "REWE", "ALDI" etc.
}
```

---

## 5. API-Endpunkte

### 5a. POST /api/receipt-scan -- Beleg analysieren

**Input:** `multipart/form-data` mit Bild (JPEG/PNG/WebP/PDF)
**Auth:** Session + Household
**Ablauf:**
1. Bild validieren (Typ, Groesse <= 5MB -- gleiche Limits wie Attachments)
2. User-Kategorien aus DB laden (Category mit householdId)
3. Claude Vision API Call mit strukturiertem Prompt (s.u.)
4. JSON-Response parsen + validieren (Zod)
5. Response an Client

**Output:**
```json
{
  "merchant": "REWE",
  "date": "2026-08-19",
  "items": [
    { "name": "Milch 3,5%", "quantity": 1, "unitPriceCents": 149, "totalCents": 149, "suggestedCategory": "Groceries" },
    { "name": "Schokolade", "quantity": 1, "unitPriceCents": 299, "totalCents": 299, "suggestedCategory": "Groceries" }
  ],
  "subtotalCents": 448,
  "taxCents": null,
  "totalCents": 448,
  "confidence": "high"
}
```

### 5b. POST /api/transactions/batch -- Gruppiert buchen

**Input:**
```json
{
  "receiptDate": "2026-08-19",
  "receiptMerchant": "REWE",
  "accountId": "...",
  "taxRelevant": false,
  "groups": [
    {
      "categoryId": "cat_groceries",
      "items": [
        { "name": "Milch 3,5%", "quantity": 1, "unitPriceCents": 149, "totalCents": 149, "position": 1 },
        { "name": "Brot", "quantity": 1, "unitPriceCents": 349, "totalCents": 349, "position": 3 }
      ]
    },
    {
      "categoryId": "cat_geschenke",
      "items": [
        { "name": "Schokolade", "quantity": 1, "unitPriceCents": 299, "totalCents": 299, "position": 2 }
      ]
    }
  ],
  "attachmentData": "<base64>"
}
```

**Ablauf:**
1. Auth + Validate (Zod)
2. `prisma.$transaction()`:
   - Pro Gruppe: Transaction anlegen (Betrag = Summe der Items, negativ da Ausgabe)
   - Pro Item: ReceiptLineItem anlegen
   - Optional: Beleg-Foto als Attachment an jede Transaktion (oder nur an die erste + Referenz)
3. Response: Array der erstellten Transaktionen

### 5c. Claude Vision Prompt (Kern des Features)

```
Du bist ein Kassenbeleg-Parser. Analysiere das Bild und extrahiere alle Positionen.

Verfuegbare Kategorien des Users: ${categories.map(c => c.name).join(", ")}

Antworte AUSSCHLIESSLICH mit validem JSON in diesem Format:
{
  "merchant": "Name des Geschaefts oder null",
  "date": "YYYY-MM-DD oder null",
  "items": [
    {
      "name": "Artikelname",
      "quantity": 1,
      "unitPriceCents": 149,
      "totalCents": 149,
      "suggestedCategory": "Name der passendsten Kategorie aus der Liste"
    }
  ],
  "subtotalCents": 448,
  "taxCents": null,
  "totalCents": 448
}

Regeln:
- Alle Preise in Cent (Integer), NICHT Euro
- Rabatte als separate Position mit negativem Betrag
- Pfand als separate Position
- suggestedCategory MUSS eine der verfuegbaren Kategorien sein
- Bei Unsicherheit: die allgemeinste passende Kategorie waehlen
- Wenn der Beleg nicht lesbar ist: leeres items-Array + "confidence": "low"
```

---

## 6. UI-Komponenten

### 6a. ReceiptScanner.tsx -- Einstiegspunkt

- **Trigger:** Neuer Button in der Bottom-Nav oder als FAB-Alternative / eigene Seite `/scan`
- **Kamera-Aufnahme:** `<input type="file" accept="image/*" capture="environment">` (existiert bereits in AttachmentManager)
- **Bild-Preview:** Zeigt das Foto vor dem Absenden
- **Lade-Zustand:** Spinner + "Beleg wird analysiert..." (Claude API dauert 2-5 Sekunden)
- **Fehlerbehandlung:** Unlesbar -> Hinweis + manuelles Erstellen anbieten

### 6b. ReceiptReview.tsx -- Review-Maske (Kernkomponente)

- **Header:** Merchant + Datum (editierbar)
- **Positions-Tabelle:**
  - Spalten: Position, Artikel, Menge, Einzelpreis, Gesamt, Kategorie
  - Kategorie = `<Select>` Dropdown mit allen User-Kategorien
  - Artikel-Name editierbar (Inline-Edit)
  - Zeile loeschbar (Muelleimer-Icon)
  - Zeile hinzufuegbar (wenn OCR etwas uebersehen hat)
- **Konto-Auswahl:** Dropdown (wie in TransactionForm)
- **Steuerrelevant-Toggle** (wie in TransactionForm)
- **Gruppierungs-Preview:** Unterhalb der Tabelle, live berechnet:
  - Pro Kategorie: Summe + Artikelliste
  - Visuell klar getrennt (Cards oder farbige Chips)
- **Actions:** Abbrechen / Buchen
- **Mobile-First:** Tabelle -> Karten-Layout auf kleinen Screens (jede Position als Card)

### 6c. ReceiptLineItemList.tsx -- Anzeige in Transaction-Detail

- In der Transaktions-Detailansicht / Edit-Form
- Zeigt die Einzelpositionen einer Beleg-Transaktion
- Read-only (Bearbeitung nur ueber erneuten Scan oder manuell)

---

## 7. Implementierungs-Phasen

### Phase A: Foundation (Schema + API-Scan)
1. Prisma-Schema erweitern (ReceiptLineItem, Transaction.receiptMerchant)
2. Migration erstellen + testen
3. `@anthropic-ai/sdk` als Dependency hinzufuegen
4. Env-Var `ANTHROPIC_API_KEY` konfigurieren
5. `POST /api/receipt-scan` implementieren (Claude Vision Call + Zod-Validation)
6. Unit-Tests mit Mock-Responses

### Phase B: Batch-Buchung
1. `POST /api/transactions/batch` implementieren
2. Prisma-Transaction: Transaktionen + LineItems + optional Attachment atomar
3. Tests mit verschiedenen Gruppierungen

### Phase C: UI -- Scanner + Review
1. `/scan` Page (oder Modal von Dashboard)
2. `ReceiptScanner.tsx` -- Foto-Aufnahme + API-Call
3. `ReceiptReview.tsx` -- Editierbare Tabelle mit Kategorie-Dropdowns
4. Gruppierungs-Preview (live berechnet)
5. Bestaetigung -> Batch-API-Call
6. Success-Toast + Redirect zu Transaktionen
7. i18n (de + en)

### Phase D: Detail-Ansicht + Polish
1. `ReceiptLineItemList.tsx` in Transaction-Detail
2. Transactions-Liste: Beleg-Icon wenn receiptLineItems vorhanden
3. Error-States verfeinern (unscharfes Bild, kein Beleg, API-Fehler)
4. Loading-Skeleton fuer Review-Maske
5. Mobile-Optimierung (375px Viewport testen)

### Phase E: Offline Capture & Queue
Ziel: Beleg im Laden fotografieren (offline), zu Hause im WLAN analysieren + buchen.

**Architektur:**
```
Offline:  [Kamera] -> imageCompression.ts -> IndexedDB (Blob-Store)
                                          -> Queue-Eintrag {type:"receipt-scan", blobKey, capturedAt, status:"pending"}

Online:   OutboxManager erkennt Netz -> liest Queue
          -> fuer jeden pending Eintrag:
             1. Blob aus IndexedDB laden
             2. POST /api/receipt-scan
             3. Ergebnis zwischenspeichern (React Query / State)
             4. Review-Maske oeffnen (oder Push-Notification)
          -> nach Buchung: Queue-Eintrag + Blob loeschen
```

**Ablauf aus User-Sicht:**
1. User ist im Laden (offline/schlechtes Netz)
2. Oeffnet /scan, fotografiert Beleg
3. Bild wird komprimiert (~0.5-1MB) + in IndexedDB gespeichert
4. UI zeigt: "Beleg gespeichert -- wird analysiert sobald online" (Toast)
5. Badge/Indicator: "1 Beleg wartet" (z.B. auf /scan Page oder im Nav)
6. Spaeter (zu Hause, WLAN): App erkennt Online-Status
7. Automatischer Upload -> Claude Vision -> Review-Maske erscheint
8. User prueft, korrigiert Kategorien, bestaetigt -> Buchung

**Technische Details:**
- **IndexedDB Store:** Separater Object-Store `receipt-queue` (nicht die bestehende Outbox, da Blobs)
- **Speicher:** ~0.5-1MB pro komprimiertem Beleg, IndexedDB hat typisch 50MB+ Quota
- **Queue-Limit:** Max 20 gequeuete Belege (Speicher-Schutz)
- **Retry:** Bei API-Fehler max 3 Versuche mit Backoff, danach manueller Retry-Button
- **Cleanup:** Nach erfolgreicher Buchung werden Blob + Queue-Eintrag sofort geloescht
- **Bestehende Outbox** (`lib/offline/outbox.ts`) wird NICHT erweitert (die nutzt localStorage fuer JSON);
  stattdessen eigener IndexedDB-basierter Store fuer Binaerdaten
- **OutboxManager-Pattern** (`lib/offline/OutboxManager.tsx`) wird als Vorbild genutzt:
  gleicher Online-Event-Listener, gleiche Flush-Logik, aber fuer Receipt-Queue

**Neue Dateien:**
- `apps/web/lib/offline/receiptQueue.ts` -- IndexedDB CRUD (save, list, get, delete)
- `apps/web/lib/offline/ReceiptQueueManager.tsx` -- React-Komponente, Online-Listener, Auto-Flush
- `apps/web/components/ReceiptQueueBadge.tsx` -- "X Belege warten" Indicator

**Geaenderte Dateien:**
- `apps/web/app/scan/page.tsx` -- Offline-Erkennung, Queue statt direktem API-Call
- `apps/web/components/ReceiptScanner.tsx` -- Fallback auf Queue wenn offline

### Phase F: Optional -- Weitere Erweiterungen
1. **Tesseract.js Fallback** fuer komplett offline OCR (schlechtere Qualitaet, aber sofortige Review-Maske)
2. **Beleg-Historie:** Merchant-Frequenz, durchschnittlicher Einkauf
3. **Lern-Effekt:** Kategorie-Zuordnungen merken ("Schokolade" -> Geschenke wenn User das oefter so aendert)
4. **Duplikat-Erkennung:** Hash ueber Merchant + Datum + Total -> Warnung bei doppeltem Scan

---

## 8. Kosten-Kalkulation

| Szenario | Bons/Monat | Claude Vision Kosten | Gesamt/Monat |
|----------|-----------|---------------------|-------------|
| Single-User | ~30 | ~2.000 Tokens/Bon x $3/1M (Input) | ~$0.18 |
| Haushalt (2 Pers.) | ~60 | | ~$0.36 |
| Heavy User | ~100 | | ~$0.60 |

Vernachlaessigbar gering (unter 1 EUR/Monat selbst bei intensiver Nutzung).

**Env-Var:** `ANTHROPIC_API_KEY` -- muss als Railway-Variable gesetzt werden.

---

## 9. Risiken & Mitigationen

| Risiko | Mitigation |
|--------|-----------|
| Unscharfe Fotos -> schlechte Erkennung | Bildqualitaets-Hinweis in UI + Kompression-Pipeline nutzen (existiert bereits) |
| Claude API nicht erreichbar | Graceful Error + Hinweis "Manuell erfassen" |
| Falsche Preise erkannt | Review-Maske ist Pflicht (kein Auto-Buchen ohne Bestaetigung) |
| Summe stimmt nicht | Validierung: Summe Items vs. erkannter Total -> Warnung anzeigen |
| Datenschutz (Beleg-Bilder an Anthropic) | Hinweis in UI; Bilder werden nur zur Analyse gesendet, nicht gespeichert bei Anthropic (API-Nutzung) |
| API-Key-Kosten laufen aus dem Ruder | Rate-Limit pro User: max X Scans/Tag |

---

## 10. Betroffene Dateien

### Neu
- `apps/web/app/api/receipt-scan/route.ts`
- `apps/web/app/api/transactions/batch/route.ts`
- `apps/web/app/scan/page.tsx`
- `apps/web/components/ReceiptScanner.tsx`
- `apps/web/components/ReceiptReview.tsx`
- `apps/web/components/ReceiptLineItemList.tsx`
- `apps/web/components/ReceiptQueueBadge.tsx`
- `apps/web/lib/receiptParser.ts` (Claude Vision Call + Prompt)
- `apps/web/lib/offline/receiptQueue.ts` (IndexedDB CRUD fuer Beleg-Bilder)
- `apps/web/lib/offline/ReceiptQueueManager.tsx` (Online-Listener, Auto-Flush)
- `apps/web/tests/receipt-scan.test.ts`
- `apps/web/tests/transactions-batch.test.ts`
- `prisma/migrations/YYYYMMDD_add_receipt_line_items/migration.sql`

### Geaendert
- `apps/web/prisma/schema.prisma` -- ReceiptLineItem Model + Transaction-Relation
- `apps/web/lib/locales/de.ts` + `en.ts` -- i18n Keys
- `apps/web/components/Header.tsx` oder `app/page.tsx` -- Navigation/Einstiegspunkt
- `apps/web/package.json` -- `@anthropic-ai/sdk` Dependency
- `apps/web/env.ts` -- `ANTHROPIC_API_KEY` Env-Var

---

## 11. Bestehende Infrastruktur (wiederverwendbar)

Folgende Komponenten existieren bereits und koennen wiederverwendet werden:
- **Attachment-Upload:** `apps/web/app/api/transactions/[id]/attachments/route.ts` (MIME-Validation, 5MB-Limit)
- **Bild-Kompression:** `apps/web/lib/imageCompression.ts` (max 2000px, JPEG-Zielgroesse 1MB)
- **Kamera-Input:** `AttachmentManager.tsx` hat bereits `capture="environment"` Input
- **Attachment-Model:** Prisma `Attachment` mit Bytes-Storage
- **Design-Tokens:** Calm-Finance-System (bg-surface, text-ink, brand etc.)
- **Toast-System:** `useToast().success()` fuer Feedback
- **Button mit Loading:** `<Button loading>` Pattern

---

## 12. Definition of Done

- [ ] `npm run lint` -- 0 errors
- [ ] `npm run typecheck` -- 0 errors
- [ ] `npm run test` -- alle Tests gruen (inkl. neue Tests)
- [ ] Mobile Preview bei 375px -- kein Overflow, alle Interaktionen funktional
- [ ] Dark Mode -- Review-Maske nutzt Design-Tokens
- [ ] i18n -- alle Strings in de.ts + en.ts
- [ ] Beleg scannen -> Positionen bearbeiten -> Buchen -> Transaktionen korrekt angelegt
- [ ] Einzelpositionen in Transaction-Detail sichtbar
- [ ] Summen-Validierung (Items vs. Beleg-Total) funktioniert
- [ ] Offline: Beleg fotografieren speichert in IndexedDB Queue
- [ ] Online: Queue wird automatisch geflusht, Review-Maske oeffnet sich
- [ ] Queue-Badge zeigt Anzahl wartender Belege
