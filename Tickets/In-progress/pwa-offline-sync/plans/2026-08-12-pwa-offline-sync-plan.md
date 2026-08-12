# Next-Level-Plan: PWA & Offline-Sync für Doewe

> **Stand:** 2026-08-12 (v2) · Recherche + Codebase-Analyse abgeschlossen, noch keine Umsetzung.
> **v2:** Web Push (Teil C, Abschnitt 5) und Haushalts-Sharing (Teil D, Abschnitt 6) als vollwertige Phasen ausgearbeitet; Bank-/CSV-Import als Entscheidungsgrundlage ergänzt (Teil E, Abschnitt 7).
> **v3:** Positionierungs-Entscheidung zu Teil E festgehalten (**manual-first / „bewusster Umgang"**, Abschnitt 7.5); Teil C um **Erfassungs-Reminder** erweitert (5.3): getimt/konfigurierbar = machbar via Server-Cron; ortsabhängig = als PWA technisch nicht möglich, Alternativen notiert.
> **Kontext:** Doewe ist eine solide, gut dokumentierte CRUD-Anwendung. Dieser Plan beschreibt den Weg zu einer installierbaren, offline-fähigen App mit Zwei-Wege-Synchronisation.

---

## 1. Bewertung der Ideen (TL;DR)

**Idee 1 — PWA:** Ja, machen — aber ehrlich eingeordnet ist das weniger „Next Level" als **professionelle Grundausstattung**: Manifest, Icons, Service Worker, sauberes Viewport-Verhalten. Der Aufwand ist klein (1–2 Tage), der gefühlte Qualitätssprung groß (installierbar, eigenes Icon, kein Browser-Chrome, kein Zoom-Ruckeln). Der beobachtete Zoom-Bug hat eine **eindeutig belegte Ursache im Code** (siehe 2.), die unabhängig von allem anderen in Minuten behebbar ist. Wichtig: Die PWA-Basis (Service Worker) ist **technische Voraussetzung** für Idee 2.

**Idee 2 — Offline + Sync:** Das ist das **eigentliche Next Level** — „local-first" ist eine der anspruchsvollsten Disziplinen im Web-Umfeld und genau das, was eine CRUD-App von einem Produkt unterscheidet. Aber: nicht als Big Bang. Die Analyse zeigt einen gestuften Weg, bei dem **Stufe 3a (offline neue Buchungen erfassen) ~90 % des Alltagsnutzens bei ~20 % der Komplexität liefert**, weil Neuanlagen mit Client-IDs konstruktionsbedingt konfliktfrei sind. Der volle Zwei-Personen-Konflikt-Sync (Stufe 3b) ist sauber spezifizierbar (Konfliktmatrix in 4.3), aber bewusst die letzte Stufe.

**Teil C — Web Push (Budget-Warnungen & Erfassungs-Reminder):** Klarer Next-Level-Baustein: Die App meldet sich von selbst („Lebensmittel-Budget zu 90 % ausgeschöpft") — der Moment, in dem eine installierte PWA sich wie eine native App anfühlt. Seit v3 gehört der konfigurierbare **Erfassungs-Reminder** dazu (5.3) — das strategische Gegenstück zur manual-first-Positionierung: Wer bewusst manuell erfasst, wird beim Dranbleiben unterstützt. Aufwand 4–7 Tage, braucht nur Phase 1 als Grundlage und ist vorziehbar. Ausarbeitung in Abschnitt 5.

**Teil D — Haushalts-Sharing:** Verwandelt den heutigen Workaround „geteiltes Login" in ein echtes Produkt-Feature: zwei Accounts, ein Haushalt, „Wer hat das gebucht?". Architektonisch der wichtigste Baustein neben Offline, weil er die Mandanten-Grenze von User auf Haushalt verschiebt — und deshalb **vor** dem vollen Konflikt-Sync (3b) kommen sollte. Ausarbeitung in Abschnitt 6.

**Teil E — Bank-Import:** Bewusst **keine** Phase, sondern eine Entscheidungsgrundlage (Abschnitt 7): Was bringt es wirklich, welche Wege gibt es **ohne** Bank-Verbindung (Datei-Import!), und welche regulatorisch-wirtschaftlichen Hürden entstehen, falls die App öffentlich skalieren und Geld verdienen soll. **Entschieden am 2026-08-12: Doewe positioniert sich manual-first („bewusster Umgang") — keine Bank-Verbindung; Details und Konsequenzen in 7.5.**

**Empfohlene Reihenfolge:** 1 → 2 → 3a → C → D → 3b (C ist unabhängig und kann direkt nach Phase 1 vorgezogen werden; E wird separat entschieden und blockiert nichts).

| Phase | Inhalt | Nutzen | Aufwand | Abhängigkeit |
|---|---|---|---|---|
| 1 | PWA-Grundausbau + Zoom-Fix | installierbar, App-Gefühl, Bug weg | 1–2 Tage | — |
| 2 | Offline **lesen** | App startet & zeigt Daten ohne Netz | 2–4 Tage | 1 |
| 3a | Offline **erfassen** (Outbox, konfliktfrei) | Buchungen unterwegs ohne Netz | 3–5 Tage | 2 |
| C | **Web Push**: Budget-Warnungen + Erfassungs-Reminder (Abschnitt 5) | App meldet sich von selbst, stützt manual-first | 4–7 Tage | 1 (vorziehbar) |
| D | **Haushalts-Sharing** (Abschnitt 6) | 2 echte Accounts, 1 Haushalt | 1–2 Wochen | vor 3b! |
| 3b | Voller Zwei-Wege-Sync mit Konfliktbehandlung | 2 Geräte gleichzeitig offline, sicher | 1–2 Wochen | D empfohlen |
| 4 *(optional)* | Sync-Engine-Evaluation (PowerSync etc.) | nur bei wachsenden Anforderungen | Spike 2–3 Tage | 3b |
| E *(entschieden: vorerst nicht — 7.5)* | Bank-/CSV-Import (Abschnitt 7) | Erfassungsaufwand sinkt | E1: 3–5 Tage | unabhängig |

Jede Phase ist einzeln shippbar und endet mit der Feature-Abschluss-Checkliste (`npm run lint` / `typecheck` / `test` grün).

---

## 2. Ist-Zustand (Codebase-Fakten, gelesen am 2026-08-12)

Alle Punkte ✅ **belegt** (Datei + Zeile), sofern nicht anders markiert.

### PWA-Status
- **Kein Manifest, kein Service Worker, kein `public/`-Verzeichnis, keine Icons** (auch kein `favicon.ico` in `app/`). Grep nach `serviceWorker|workbox|serwist|next-pwa`: nur TS-Lib-Definitionen.
- `apps/web/app/layout.tsx:20-23`: Metadata-Export nur mit `title`/`description` — **kein `viewport`-Export, kein `theme-color`, kein Manifest-Link, kein Apple-Touch-Icon**.
- `apps/web/next.config.mjs`: minimal (reactStrictMode, swcMinify, transpilePackages, webpack-Hook) — kein PWA-Plugin.
- `apps/web/components/Header.tsx:148`: Bottom-Nav hat **bereits** `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]` — safe-area für Standalone-Modus ist vorbereitet. 👍
- Dark Mode: class-based (`tailwind.config.ts`, `darkMode: "class"`), localStorage-Key `doewe-theme`, FOUC-Script in `layout.tsx:26-39` → `theme-color` muss beide Modi bedienen.
- `apps/web/middleware.ts:21`: `withAuth`-Matcher schützt alles **ohne Punkt im Pfad** (Ausnahmen: `api/auth`, `api/demo`, `api/health`, `login`, `forgot-password`, `reset-password`, `impressum`, `datenschutz`, `_next`, `static`, `favicon.ico`, `assets`, `.*\..*`). Folge: `sw.js`, `manifest.webmanifest`, Icons (haben Dateiendung) laufen durch; eine **Offline-Fallback-Route wie `/~offline` müsste explizit in die Ausnahmen**.

### Zoom-Bug (Idee-1-Auslöser) — Ursache gefunden
- iOS Safari zoomt automatisch auf ein fokussiertes Formularfeld, wenn dessen **berechnete Schriftgröße < 16px** ist (Apple-Heuristik, gilt auch im Standalone-Modus).
- ✅ Belegt: Das Suchfeld `apps/web/app/transactions/page.tsx:456` trägt explizit **`text-sm` (14px)** → genau dieses Feld löst den Zoom aus.
- ✅ Belegt: Alle übrigen Formular-Controls haben **keine** explizite Größenklasse (`components/TransactionForm.tsx:500ff`) und erben **16px** vom aktiven `@tailwindcss/forms`-Plugin (`node_modules/@tailwindcss/forms/src/index.js:5` → `fontSize.base` = 1rem) → kein Zoom dort.
- ✅ Belegt: Grep (2026-08-12) findet **kein weiteres** `input|select|textarea` mit `text-xs|text-sm`. Das Suchfeld ist der einzige Treffer.
- Das „Menü verschiebt sich" ist Folgeeffekt des Zooms (Visual Viewport ≠ Layout Viewport bei gezoomter Seite, fixe Elemente erscheinen versetzt) — mit dem Zoom-Fix voraussichtlich miterledigt. ⚠️ Vermutung, nach Fix am Gerät verifizieren.

### Datenzugriffs-Architektur (entscheidend für Idee 2)
- ✅ **Alle Hauptseiten sind `'use client'`** und laden per nativem `fetch()` von den `/api`-Routen (Dashboard `app/page.tsx`, `transactions`, `review`, `categories`, `saving-plan`, `settings`). **Keine Fetch-Library** (kein SWR, kein React Query, kein axios) in `apps/web/package.json`.
- Mutationen: direktes `fetch(POST/PATCH)` in Komponenten, z. B. `components/TransactionForm.tsx:242-273`. Kein Retry, keine Queue, kein Offline-Handling.
- → **Gute Nachricht:** Es gibt keine Server-Component-Datenpfade, die man aufbrechen müsste. Der Umbau auf eine cachende Client-Datenschicht (TanStack Query) ist mechanisch.

### Prisma-Schema (Sync-Relevanz)
- Alle Models: `@id @default(cuid())`, **nur `createdAt`** — ⚠️ **kein `@updatedAt` auf irgendeinem Model, kein `deletedAt`** (Hard Deletes). Für Sync/Konflikte fehlt beides (→ 4.3-Migration).
- Uniques: `Category(userId,name)`, `Budget(accountId,categoryId,month,year)`, `RecurringTransactionSkip(recurringId,year,month)` — Kollisionskandidaten bei parallelem Offline-Anlegen (→ Konfliktmatrix).
- ✅ **Recurring Transactions sind reine Templates und werden nie materialisiert** (`app/api/recurring-transactions/route.ts:1-15`, Analytics rechnet Projektionen). Das eliminiert eine ganze Klasse von Sync-Races (doppelte Materialisierung).
- `Attachment.data` ist `Bytes` in Postgres → Binär-Uploads bleiben vorerst online-only.
- Auth: JWT-Sessions (next-auth v4), Session-Eviction über `passwordChangedAt` — relevant für Sync-Flush nach Re-Login (→ 4.2).

---

## 3. Phase 1 — PWA-Grundausbau (Idee 1)

### 3.1 Zoom-Fix (Quick Win — geht auch sofort, ohne den Rest)
1. `apps/web/app/transactions/page.tsx:456`: `text-sm` → **`text-base md:text-sm`** (mobil 16px, ab Tablet wieder kompakt). Ggf. `py-2` optisch nachjustieren.
2. **Nicht** per `maximum-scale=1` / `user-scalable=no` „lösen": verletzt WCAG 2.1 SC 1.4.4; Android Chrome blockiert damit echtes Pinch-Zoomen. Die 16px-Lösung ist die einzig saubere.
3. Regel festhalten in `.claude/rules/components.md`: *„Fokussierbare Controls (input/select/textarea) mobil nie unter `text-base` — iOS zoomt bei < 16px."* Sonst kommt der Bug mit der nächsten Komponente zurück.
4. Verifikation am iPhone: Suchfeld fokussieren → kein Zoom, Nav bleibt stehen. Falls die **Tastatur-Überlappung** der Bottom-Nav danach noch stört: separates Polish-Ticket (VisualViewport-API bzw. Nav bei Fokus ausblenden) — nicht Teil dieser Phase.

### 3.2 Viewport- & Metadata-Export
In `apps/web/app/layout.tsx` ergänzen (Next 14: `themeColor`/`viewport` gehören in den `viewport`-Export, nicht in `metadata`):

```ts
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // safe-area-inset ist in Header.tsx:148 schon verbaut
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },   // bg-white
    { media: "(prefers-color-scheme: dark)", color: "#171717" },    // neutral-900
  ],
};
```

Dazu in `metadata`: `appleWebApp: { capable: true, title: "Doewe", statusBarStyle: "default" }`.
⚠️ Hinweis: `themeColor` per Media-Query folgt dem OS-Schema, nicht dem class-basierten App-Toggle — für den Statusbar-Hintergrund akzeptabel; bei Bedarf später dynamisch per `<meta>`-Update aus `ThemeContext`.

### 3.3 Manifest + Icons
- **`apps/web/app/manifest.ts`** (Next-Konvention, wird als `/manifest.webmanifest` serviert — passiert den Middleware-Matcher, da Dateiendung):
  - `name`/`short_name: "Doewe"`, `id: "/"`, `start_url: "/"`, `display: "standalone"`, `lang: "de"`, `background_color: "#ffffff"`, `theme_color: "#4f46e5"` (Indigo, Akzentfarbe der App), Icons 192 + 512 jeweils `purpose: "any"` und `"maskable"`.
- **Icons erzeugen** (existieren noch gar nicht): `app/icon.png` (Favicon-Ersatz) + `app/apple-icon.png` (180×180, Next verlinkt automatisch) + `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (Safe-Zone ~80 % beachten). Einfaches Wortmarken-/„D€"-Icon reicht für den Start.
- Optional: `shortcuts` im Manifest (z. B. „Neue Buchung" → `/transactions?new=1`) — nur wenn die Route einen Query-Trigger hat, sonst weglassen.

### 3.4 Service Worker via `@serwist/next`
Serwist ist der gepflegte Nachfolger des verwaisten `next-pwa` (Workbox-Fork, App-Router-Support). Setup laut offizieller Doku:

```bash
npm i @serwist/next && npm i -D serwist   # im Workspace @doewe/web
```

- `next.config.mjs`: mit `withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js", disable: process.env.NODE_ENV === "development" })` wrappen (bestehenden `webpack`-Hook beibehalten — Verträglichkeit beim Setup prüfen).
- `app/sw.ts`: `defaultCache` aus `@serwist/next/worker` verwenden — kennt die Next-Eigenheiten (u. a. RSC-Requests, `_next/static`).
- **Caching-Prinzip Phase 1: Der SW cached nur Shell + Assets + Offline-Fallback. `/api/**` wird bewusst NICHT im SW gecached.** Begründung: Daten-Offline kommt in Phase 2 sauber in die App-Schicht (Query-Cache in IndexedDB); doppeltes Caching in Cache Storage erzeugt Stale-Daten-Bugs und legt authentifizierte JSON-Antworten unnötig ab.
- Offline-Fallback: `app/~offline/page.tsx` (statische Seite „Du bist offline") + **`~offline` in die Middleware-Matcher-Ausnahmen** aufnehmen (sonst würde der Precache-Fetch beim SW-Install auf `/login` umgeleitet).
- `.gitignore`: `public/sw*` und `public/swe-worker*`. `tsconfig.json` (web): `"webworker"` in `lib`, `@serwist/next/typings` in `types`, `public/sw.js` excluden.
- ⚠️ Vermutung (beim Setup verifizieren): aktuelle `@serwist/next`-Major (v9) deckt Next 14.2 per peerDependency ab — Serwist entstand in der Next-14-Ära; die aktuellen Guides beziehen sich meist auf Next 15/16.

### 3.5 Install-UX & iOS-Realität (Rechercheergebnis)
- **iOS installiert PWAs nur über Teilen → „Zum Home-Bildschirm"** (kein `beforeinstallprompt`). Seit **iOS 26** öffnen so hinzugefügte Sites standardmäßig als Web-App — die Hürde ist gesunken. Kleiner Hinweis-Text in den Settings („App installieren") mit Plattform-Weiche: iOS = Anleitung, Android/Chrome = echter Install-Button über das `beforeinstallprompt`-Event.
- **EU/DMA-Entwarnung:** Apple hatte die Home-Screen-Web-Apps in der EU-Beta von iOS 17.4 (Feb 2024) tatsächlich deaktiviert, das aber **vor dem Release am 01.03.2024 offiziell zurückgenommen** — Home-Screen-Web-Apps (auf WebKit-Basis) funktionieren in der EU bis heute. **Achtung:** Etliche 2024–2026er-Blogartikel (z. B. der MagicBell-PWA-Guide) behaupten das Gegenteil und sind schlicht veraltet/falsch. Primärquelle ist Apples DMA-Developer-Seite.
- **Web Push** (z. B. Budget-Warnungen) ist für installierte PWAs ab iOS 16.4 möglich, Safari 18.4+ kann sogar Declarative Web Push — ausgearbeitet als **Teil C** (Abschnitt 5); der SW aus dieser Phase ist die Grundlage dafür.

### 3.6 Definition of Done (Phase 1)
- Lighthouse: installierbar, Manifest valide, SW aktiv.
- iPhone-Test (Safari + installiert): kein Zoom im Suchfeld; Standalone-Start ohne Browser-Chrome; safe-area/Statusbar korrekt in hell + dunkel; Offline-Aufruf zeigt Fallback-Seite statt Dino.
- Android/Chrome-Test: Install-Prompt, maskable Icon rund maskiert korrekt.
- `npm run lint` / `typecheck` / `test` grün.

---

## 4. Phasen 2–4 — Offline & Sync (Idee 2)

### 4.0 Zielbild, Leitplanken, Nicht-Ziele
**Zielbild final:** Beide Haushaltsmitglieder können die App ohne Netz öffnen, Daten sehen und Buchungen erfassen; beim Reconnect synchronisiert alles automatisch; gleichzeitige Offline-Änderungen werden deterministisch und nachvollziehbar zusammengeführt.

**Architektur-Vorentscheidungen:**
1. **TanStack Query als einheitliche Datenschicht** einziehen. Alle Seiten sind bereits Client-Components mit `fetch()` (✅ belegt) — der Umbau ist mechanisch, bringt sofort Caching/Dedup/Refetch und ist die Grundlage für Persistenz + Optimistic Updates.
2. **Server bleibt Autorität.** Kein CRDT, keine Peer-to-Peer-Merges — der Server entscheidet, Clients konvergieren via Pull.
3. **Kein Verlass auf die Background Sync API** — iOS Safari unterstützt sie nicht (auch 2026 nicht, ebenso wenig Periodic Background Sync). Flush passiert bei: App-Start, `online`-Event, `visibilitychange`/Fokus. Für eine Finanz-App völlig ausreichend.
4. **Storage:** `navigator.storage.persist()` anfordern. Installierte iOS-Web-Apps haben laut WebKit einen **eigenen Nutzungszähler** — die berüchtigte 7-Tage-ITP-Löschung betrifft eine regelmäßig genutzte installierte App praktisch nicht. Quota seit Safari 17 großzügig (bis ~60 % Disk).

**Nicht-Ziele (bewusst):** keine Echtzeit-Kollaboration/Live-Sync, keine CRDTs, **Attachments (Bytes-Uploads) offline zunächst ausgeschlossen**, Analytics offline nur als letzter gecachter Stand (keine lokale Neuberechnung), keine Offline-Registrierung/Passwort-Flows.

### 4.1 Phase 2 — Offline LESEN
- `@tanstack/react-query` einführen; pro Ressource Query-Hooks in `apps/web/lib/api/` (z. B. `useTransactions`, `useSummary`, `useSavingPlan` …) — alle `fetch()`-GETs der Seiten dorthin migrieren. **Das ist der Hauptaufwand dieser Phase** (6 Seiten + Dashboard-Widgets).
- Query-Cache mit Persister auf **IndexedDB** (idb-keyval-basierter Persister laut TanStack-Doku; localStorage scheidet aus — blockiert Main Thread, zu klein). `buster` = App-/Build-Version, damit Schema-Änderungen den Cache invalidieren.
- Offline-UX: globaler Online-Status (`navigator.onLine` + `online`/`offline`-Events) → dezentes Banner „Offline — Stand von {Zeitpunkt}". i18n-Keys ans Ende von `lib/locales/de.ts`/`en.ts` (Konvention).
- Zusammenspiel: SW (Phase 1) liefert die Shell, der persistierte Query-Cache die Daten → **App startet im Flugmodus vollständig mit letztem Stand.**
- Session-Randfall: Offline-Navigation erreicht die Middleware nie (kein Netz) — Shell + Cache funktionieren; erst der nächste echte Request braucht die Session wieder.
- **DoD:** Flugmodus-Test: App öffnen → alle Seiten zeigen letzte Daten ohne Fehler; Reconnect → automatischer Refetch. Checks grün.

### 4.2 Phase 3a — Offline ERFASSEN (Outbox, konfliktfrei)
**Scope-Entscheidung:** Offline erlaubt ist das **Anlegen neuer Transaktionen** (+ Bearbeiten/Löschen *noch nicht synchronisierter* lokaler Einträge). Offline-Edits an bereits synchronisierten Daten bleiben gesperrt (Feld deaktiviert + Hinweis). → Konstruktionsbedingt **konfliktfrei**, deckt aber den echten Alltagsfall ab („unterwegs ohne Netz schnell den Einkauf eintragen").

Bausteine:
1. **Client-IDs:** `@paralleldrive/cuid2` im Client generieren; `POST /api/transactions` akzeptiert optionales `id` (Zod: cuid-Format, Kollision → 409). Server bleibt Autorität für alles Weitere.
2. **Outbox in IndexedDB** (Dexie oder `idb`): `{ mutationId: uuid, entity, op, payload, createdAt, attempts, status }`. FIFO-Flush bei App-Start / `online` / Fokus; **Web Locks API** als Single-Flusher gegen Multi-Tab-Doppelverarbeitung.
3. **Idempotenz serverseitig:** neue Tabelle `MutationLog (mutationId @unique, userId, entity, appliedAt, responseJson)`. Kommt dieselbe `mutationId` erneut (Netzabbruch nach Commit!), wird die gespeicherte Antwort zurückgegeben statt doppelt zu buchen. Header `Idempotency-Key` im bestehenden POST-Handler auswerten — **kein separater Sync-Endpoint nötig in 3a**.
4. **Optimistic UI:** Query-Cache direkt schreiben; Pending-Einträge mit Badge „wird synchronisiert" in der Liste; Fehlerzustand mit manuellem Retry.
5. **401 beim Flush** (Session abgelaufen / `passwordChangedAt`-Eviction): Queue **behalten**, Re-Login-Banner zeigen, nach Login weiterflushen.
6. **Tests:** Outbox-Reducer und Payload-Mapping als pure functions in `packages/shared` (Vitest-Tabellentests); API-Integrationstest in `apps/web/tests/`: identischer Batch zweimal gesendet ⇒ identischer Endzustand (Idempotenz).

### 4.3 Phase 3b — Voller Zwei-Wege-Sync mit Konfliktbehandlung
Jetzt der Fall aus deiner Frage: **zwei Personen/Geräte arbeiten gleichzeitig offline**, auch an denselben Daten.

> **v2-Hinweis:** Mit Teil D (Haushalts-Sharing, Abschnitt 6) wird die Sync-Partition `householdId` statt `userId`. Deshalb D **vor** 3b umsetzen — dann wird das Sync-Protokoll von Anfang an haushaltsbasiert gebaut statt später migriert.

**Schema-Migration (Voraussetzung, ✅ Lücke belegt — heute existiert weder `@updatedAt` noch Soft-Delete):**
- `updatedAt DateTime @updatedAt` auf `Transaction`, `Category`, `Budget`, `RecurringTransaction`, `Account` (Backfill: `now()`).
- `deletedAt DateTime?` (Tombstones) auf denselben Models; **Hard → Soft Delete** umstellen: zentrale Prisma-Client-Extension filtert `deletedAt: null` in allen Reads (mit Tests absichern — jede vergessene Stelle zeigt Gelöschtes wieder an). Purge-Job (> 90 Tage) später.
- `MutationLog` aus 3a wird wiederverwendet.

**Sync-Protokoll (bewusst simpel, v1):**
- `POST /api/sync/push` — Batch von Ops `{ mutationId, entity, op: create|update|delete, id, patch, baseUpdatedAt }`, transaktional angewendet, pro Op Ergebnis `applied | duplicate | conflict{serverRow}`.
- `GET /api/sync/pull` — **v1 = Voll-Snapshot pro User** (Personal-Finance-Datenmenge ist klein, Attachments ausgenommen) mit ETag/Hash-Kurzschluss („nichts geändert" = 304). **v2 = Delta-Cursor** (`updatedAt` + `id`-Tiebreak) nur, falls der Snapshot messbar zu groß wird. Diese Reihenfolge spart die komplette Cursor-Korrektheits-Klasse (Clock Skew, verpasste Rows) für den Anfang.
- Merge-Regel: **patch-basiertes Feld-Merge + Last-Write-Wins pro Feld**, Tiebreaker = Server-Empfangsreihenfolge. Jeder überschriebene Konflikt landet im `ConflictLog` und wird in der UI dezent gemeldet („Buchung X wurde auf einem anderen Gerät geändert — neuester Stand übernommen").

**Konfliktmatrix (das „2 Leute offline"-Szenario durchdekliniert):**

| Szenario | Verhalten |
|---|---|
| Beide erstellen Buchungen | Kein Konflikt — verschiedene Client-IDs, beide bleiben; Salden rechnet der Server ohnehin aus den Rows |
| Beide editieren dieselbe Buchung, **verschiedene Felder** | Feld-Merge: beide Änderungen bleiben erhalten |
| Beide editieren **dasselbe Feld** | LWW: später gesyncte Änderung gewinnt; `ConflictLog` + UI-Hinweis |
| Edit vs. Delete derselben Buchung | **Delete gewinnt** (Tombstone), Hinweis mit Undo (Restore = `deletedAt: null`) — bei Finanzdaten ist Löschen eine bewusste Entscheidung |
| Beide legen Budget für gleiche Kategorie+Monat an (`@@unique(accountId,categoryId,month,year)`) | Upsert-Merge, LWW auf `amountCents`, Hinweis |
| Beide legen Kategorie mit gleichem Namen an (`@@unique(userId,name)`) | Zweite wird zu „Name (2)" umbenannt + Hinweis; alternativ: Server mappt auf existierende Kategorie |
| Beide skippen denselben Recurring-Monat (`@@unique(recurringId,year,month)`) | Idempotent — Unique-Constraint macht’s zum No-op |
| Recurring Transactions | Reine Templates, keine Materialisierung (✅ belegt) → normale Row-Syncs, keine Race-Klasse |

**Warum kein CRDT / keine Hybrid Logical Clocks:** 2-Personen-Haushalt, seltene echte Feldkonflikte, Server ist immer erreichbar-wenn-online und autoritativ. Feld-LWW + Konfliktjournal ist hier das angemessene Werkzeug; HLC/Vector Clocks sind als spätere Verfeinerung notiert, falls Geräte-Uhren je zum Problem werden (Server-Empfangszeit umgeht das v1-seitig komplett).

**DoD 3b:** Zwei-Geräte-Testmatrix (beide Flugmodus, alle 8 Szenarien), Merge-Funktionen als pure functions in `packages/shared` mit Vitest-Tabellentests, Push/Pull-Integrationstests inkl. Doppel-Replay, Checks grün.

### 4.4 Phase 4 (optional) — Fertige Sync-Engine statt Eigenbau?
Marktstand 2026 (recherchiert), falls die Anforderungen wachsen:

| Engine | Charakteristik | Fit für Doewe |
|---|---|---|
| **PowerSync** | Reifste Option; Postgres → SQLite im Client, Self-Host möglich; Write-Path läuft über die **eigene** Backend-API (bestehende Routen blieben nutzbar) | Bester Kandidat bei echtem Bedarf; zusätzlicher Dienst neben Railway-Postgres nötig |
| **ElectricSQL** | Read-Path-Sync („Shapes" über HTTP), pairt mit TanStack DB; Writes baut man ohnehin selbst (≈ unsere Outbox) | Ersetzt unser Pull, nicht unser Push — interessant als Phase-2/3-Beschleuniger |
| **Zero (Rocicorp)** | Query-getrieben, seit 06/2026 stable 1.0; braucht `zero-cache`-Dienst | Elegante DX, aber jüngste Option + Extra-Infra |
| **RxDB** | Client-DB mit Replikationsprotokoll, keine Server-Infra (Endpoints selbst bauen) | Solide, aber Premium-Storages kostenpflichtig |
| **TanStack DB + `offline-transactions`** | Junges 0.x-Package mit fertigem Outbox-Pattern (Persist, Retry, Leader Election) | Beobachten — könnte Teile von 3a ersetzen |

**Empfehlung:** Erst Eigenbau (3a/3b). Datenmenge klein, keine neue Infrastruktur, voller Lerneffekt, exakt passende Konfliktregeln. **Wechsel-Kriterien** (dann Spike): echtes Multi-User-Sharing (= Teil D) kombiniert mit Live-Sync-Bedarf zwischen Geräten, oder der Snapshot-Pull wird spürbar langsam.

### 4.5 Risiken & offene Punkte
- **iOS ohne Background Sync:** Flush nur bei geöffneter App — akzeptiert (Erfassen-Fall funktioniert, weil man die App dabei offen hat).
- **Soft-Delete-Umstellung** ist die riskanteste Einzeländerung (jede Query muss filtern) → eigene Migration + Test-Sweep, nicht nebenbei.
- ⚠️ Vermutung: `pretest` (Schema-Push + Seed) verträgt die neuen Pflichtfelder problemlos, da `@updatedAt`/`deletedAt?` defaults/nullable sind — beim Migrieren verifizieren.
- ❌ Unbekannt: reales Nutzungsmuster (wie oft sind wirklich zwei Geräte gleichzeitig offline?) — falls selten, kann 3b lange hinter 3a zurückstehen.
- Geteiltes Login (ein User, zwei Personen) vereinfacht die Rechteseite des Syncs in 3a; mit Teil D (Haushalts-Sharing, Abschnitt 6) wechselt die Partition auf `householdId` — deshalb D **vor** 3b umsetzen.

---

## 5. Teil C — Web Push: Budget-Warnungen & Erfassungs-Reminder

**Ziel:** Die App meldet sich von selbst: „⚠️ Lebensmittel: Budget zu 90 % ausgeschöpft" oder „Dein Monats-Review ist bereit". Für den Haushalts-Use-Case der sichtbarste Next-Level-Moment — die installierte PWA verhält sich wie eine native App. Sobald Teil D existiert, gehen Warnungen an **beide** Haushaltsmitglieder. Seit v3 umfasst Teil C zwei Push-Familien: **Warnungen** (Budget, 5.2) und den konfigurierbaren **Erfassungs-Reminder** (5.3) als strategisches Gegenstück zur manual-first-Entscheidung (7.5).

### 5.1 Plattform-Realität (recherchiert)
- iOS: Web Push **nur für installierte** Home-Screen-Apps, ab iOS 16.4; der Permission-Dialog darf nur aus einer **User-Geste** heraus angefordert werden → Voraussetzung ist Phase 1.
- Seit iOS/Safari 18.4 (März 2025) gibt es zusätzlich **Declarative Web Push** (JSON-Payload ohne Service-Worker-Verarbeitung, energieeffizienter, privatsphärenfreundlicher). Standard-Web-Push über den SW bleibt der gemeinsame Nenner für Android/Desktop → **v1 klassisch über den Phase-1-SW**, Declarative als spätere Optimierung.
- Push-Payloads laufen (verschlüsselt) über die Push-Dienste von Apple/Google/Mozilla → Payload minimal halten: v1 ohne konkrete Beträge („Budget {Kategorie} über {Schwelle} %"), Datenschutzerklärung um Push ergänzen.

### 5.2 Architektur
1. **Schema:**
   - `PushSubscription { id cuid, userId, endpoint @unique, p256dh, auth, userAgent?, createdAt, lastSeenAt }` — mehrere Geräte pro User; HTTP 404/410 beim Versand → Row löschen.
   - `BudgetAlertLog { id, budgetId, year, month, threshold, sentAt, @@unique([budgetId, year, month, threshold]) }` — Dedupe per Unique-Constraint, dasselbe Idempotenz-Muster wie `RecurringTransactionSkip` (✅ belegt, `schema.prisma:107`).
   - `User.locale` (`de|en`) + `User.notifyBudgetAlerts` / `User.notifyMonthlyReview` (Boolean). Begründung: Die Sprachwahl liegt heute **nur client-seitig** in localStorage (✅ belegt, `apps/web/lib/i18n.tsx:30,38`) — serverseitig gerenderte Push-Texte brauchen die Sprache am User; der Settings-Sprachwechsel synchronisiert das Feld.
2. **Server:** `web-push`-Package + VAPID-Keys (`VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `env.ts`); Routen `POST/DELETE /api/push/subscription`; Versand-Helper `lib/push.ts` mit Console-Fallback ohne Konfiguration — analog zum bewährten Stufen-Muster in `lib/mailer.ts` (✅ belegt).
3. **Trigger v1 — rein event-getrieben, KEIN Cron nötig:** Nach Transaction-`POST/PATCH/DELETE` serverseitig den Budget-Verbrauch der betroffenen (Kategorie, Monat) prüfen. Die Berechnung „Budget vs. Ist pro Kategorie" existiert bereits in `/api/analytics/summary` (✅ belegt: `categoryBudgets`, `route.ts:18` + `:140ff`) → **als Helper extrahieren, nicht duplizieren**. Schwellen 80 % / 100 %; die Schwellen-Logik als pure function in `packages/shared` (Vitest-Tabellentests; Cents-Arithmetik liegt dort schon).
4. **Trigger v2 — mit Scheduler:** „Monats-Review ist bereit" am 1. des Monats: Railway-Cron ruft `/api/cron/notify-monthly-review` mit Secret-Header auf (Route in Middleware-Ausnahmen aufnehmen, Secret im Handler prüfen).
5. **Client/UI:** Settings-Abschnitt „Mitteilungen": Button „Auf diesem Gerät aktivieren" (= Permission-Geste + Subscription-Registrierung), Toggles je Alert-Typ, Test-Push. iOS-Weiche: solange nicht standalone (`display-mode: standalone`-Media-Query), Hinweis „zuerst App installieren". i18n-Keys ans Ende von `de.ts`/`en.ts` (Konvention).
6. **SW-Erweiterung:** `push`- + `notificationclick`-Handler in `app/sw.ts` (Klick öffnet `/budgets` bzw. `/review`).
7. Optional: Badging API (Zähler am App-Icon, iOS 16.4+).

### 5.3 Erfassungs-Reminder (getimt & selbst konfigurierbar)

Das flankierende Feature zur manual-first-Positionierung (7.5): Wer bewusst manuell erfasst, braucht Unterstützung beim **Dranbleiben** — die App erinnert, statt Daten zu importieren.

**Plattform-Check (recherchiert — wichtig für die Erwartungshaltung):**
- **Client-seitig geplante Notifications gibt es im Web nicht:** Chromes „Notification Triggers API" (hätte genau das gekonnt, inkl. angedachter Location-Trigger) kam nie über den Origin Trial von 2019 hinaus; die Doku ist seitdem eingefroren (⚠️ „eingestellt" aus dem Stillstand geschlossen — es existiert bis heute keine ausgelieferte Web-API dafür). → Getimte Reminder laufen **server-seitig**: ein Cron prüft, wem eine Erinnerung zusteht, und sendet Web Push. Funktioniert zuverlässig auf Android und iOS (installierte PWA).
- **Ortsabhängige Push (Geofencing) sind als PWA technisch nicht möglich:** ✅ recherchiert — die W3C-Geofencing-API wurde vor Jahren aufgegeben, und die Geolocation API stoppt sofort, sobald die App im Hintergrund ist; kein Browser gibt Web-Apps Hintergrund-Standortzugriff. Das ist Native-App-Territorium (nur relevant, falls je ein App-Store-Wrapper à la Capacitor kommt).
- **Machbare Web-Alternative zum Orts-Trigger:** Standort-Assist im **Vordergrund** — beim Öffnen des Erfassungs-Formulars per Geolocation (Opt-in) den groben Ort lesen und die zuletzt an diesem Ort genutzte Kategorie vorschlagen („Wieder Lebensmittel?"). Datenschutz: Koordinaten nur gerundet und nur lokal (IndexedDB), nie zum Server. Als **v2-Idee** notiert, nicht Teil von C-v1.

**Design v1:**
1. **Einstellungen:** `ReminderSetting { userId @unique, enabled, time ("20:00"), weekdays (Bitmaske), timezone (IANA, beim Speichern vom Client via Intl.DateTimeFormat().resolvedOptions().timeZone), smartSuppress (default true), lastSentOn (Date?) }` — eigenes Model hält `User` schlank.
2. **Smart-Suppression (der Clou):** Erinnert NUR, wenn an dem Tag noch nichts erfasst wurde — Query auf `Transaction.createdAt >= Tagesanfang in User-TZ`; nach Teil D pro Mitglied via `createdByUserId`. Wer schon gebucht hat, wird nie genervt — das hält die Permission langfristig am Leben.
3. **Scheduler:** Railway-Cron alle 15 Min → `POST /api/cron/send-reminders` (Secret-Header, Middleware-Ausnahme): selektiert User mit `enabled`, passendem Wochentag, lokaler Zeit im 15-Min-Fenster, Suppression-Check, dann Push („Schon alles erfasst? Dauert nur 2 Minuten."). Texte via `User.locale` (5.2), i18n-Keys ans Ende von `de.ts`/`en.ts`.
4. **Dedupe:** `lastSentOn` — maximal eine Erinnerung pro Tag, auch bei Cron-Überlappungen oder Neustarts.
5. **UI:** im Settings-Abschnitt „Mitteilungen" (5.2 Punkt 5): Zeit-Picker, Wochentags-Auswahl, Smart-Toggle.
6. **Später denkbar:** Streak-Anzeige („7 Tage in Folge erfasst"), Wochen-Digest („Review-Sonntag"), Standort-Assist (s. o.).

### 5.4 DoD & Aufwand
- Budget-Push: iPhone (installiert) UND Android erhalten ihn; dieselbe Schwelle im selben Monat sendet **nicht** erneut (AlertLog-Test); Abmelden/410 räumt Subscriptions auf; Payload ohne sensible Beträge.
- Reminder: kommt zur eingestellten Zeit in der User-Zeitzone; kommt NICHT, wenn heute schon erfasst wurde (Suppression-Test); maximal 1×/Tag; Cron-Endpoint ohne Secret liefert 401.
- Checks grün (`lint`/`typecheck`/`test`); Schwellen- und Suppression-Logik als pure functions in `packages/shared` getestet.
- **Aufwand: 3–5 Tage (Warnungen) + 1–2 Tage (Reminder) = 4–7 Tage. Abhängigkeit: nur Phase 1** (kann vor den Offline-Phasen liegen).

---

## 6. Teil D — Haushalts-Sharing (zwei Accounts, ein Haushalt)

**Ziel:** Der heutige Workaround „geteiltes Login mit Familien-E-Mail" wird zum Feature: zwei echte User-Accounts teilen einen Haushalt. Das bringt: „Wer hat das gebucht?", getrennte Push-Subscriptions und Sprachen, individuelle Passwörter (heute wirft ein Passwortwechsel über die `passwordChangedAt`-Eviction **beide** Personen aus der Session) — und saubere Mandanten-Grenzen für den Offline-Sync.

**Warum vor 3b:** 3b partitioniert Pull/Push nach Daten-Eigentümer. Wechselt der Eigentümer nachträglich von User auf Haushalt, müsste das Sync-Protokoll migriert werden — deshalb D zuerst; 3b baut dann direkt auf `householdId` auf.

### 6.1 Datenmodell (Empfehlung: Haushalt als Mandant)
- `Household { id cuid, name, createdAt }`
- `HouseholdMember { id, householdId, userId @unique, role (OWNER|MEMBER), joinedAt }` — v1: **genau ein Haushalt pro User** (`@unique` auf userId) → einfacher Session-Claim, kein Haushalts-Umschalter in der UI.
- `HouseholdInvite { id, householdId, email, role, tokenHash @unique, expiresAt, acceptedAt? }` — exakt das bewährte `PasswordResetToken`-Muster (✅ belegt, `schema.prisma:154ff`). Versand über den vorhandenen Mailer (✅ belegt, `apps/web/lib/mailer.ts`: SMTP → Resend → Console-Fallback; Achtung laut Datei-Header: Railway blockt ausgehendes SMTP unterhalb Pro → Resend-Pfad). Zusätzlich Invite-**Link/QR** zum direkten Teilen — funktioniert ganz ohne E-Mail-Zustellung.
- **Scoping:** `Account.householdId` + `Category.householdId` (Category-Unique wird `[householdId, name]`); Transaction/Budget/Recurring hängen an Account bzw. Category und erben den Scope. Neu: `Transaction.createdByUserId?` (Backfill: bisheriger Account-Besitzer) → UI-Badge „von {Name}".
- **Verworfen für v1:** Sharing pro Konto (`AccountMember`) — flexibler (private + geteilte Konten koexistieren), aber Kategorien/Budgets/Analytics sind im realen Nutzungsmodell haushaltsweit; Konto-Granularität würde jede Auswertung verkomplizieren. Als v2-Idee notiert („privates Konto"-Flag).

### 6.2 Migration (kritischster Teil)
1. Pro bestehendem User: Haushalt anlegen, OWNER-Membership, `householdId` auf dessen Accounts/Categories backfillen — eine Transaktion, gegen Seed **und** Prod-Dump getestet.
2. v1-Einschränkung: **Einladungen können nur frische Accounts ohne eigene Daten annehmen** → die hässliche Klasse „zwei bestehende Haushalte mergen" (Kategorien-Namenskollisionen, Budget-Duplikate) entfällt komplett. „Haushalte zusammenführen" ist ein späteres Feature, falls je gebraucht.

### 6.3 Auth, API-Sweep, UI
- **Session:** Der `jwt`-Callback (✅ belegt, `lib/authOptions.ts:101`) stampt `householdId` + `role` in den Token; der dort bereits vorhandene per-Request-DB-Read (passwordChangedAt-Eviction) nimmt die Membership **im selben Query** mit — kein zusätzlicher Roundtrip. `SessionUser` (`lib/auth.ts:8`) um `householdId` erweitern; die `TEST_USER_ID_BYPASS`-Testmechanik (✅ belegt, `lib/auth.ts:28-33`) bekommt einen Household-Bypass, damit die API-Tests weiterlaufen.
- **API-Sweep (Fleißarbeit mit Sicherheitsrelevanz):** alle ~25 Routen von `where: { account: { userId: user.id } }` auf `householdId`-Scope. Dazu gehört das Update von `.claude/rules/api-routes.md`, das heute das userId-Muster als Konvention vorschreibt — Regel-Update ist Teil der DoD.
- **UI:** Settings-Abschnitt „Haushalt" (Name, Mitglieder, Einladen, Verlassen); Registrierung bekommt den Zweig „Einladung annehmen". Rollen v1 bewusst flach: OWNER (verwalten), MEMBER (alles Fachliche); Read-only-Rolle später.

### 6.4 Sicherheit, DoD & Aufwand
- IDOR-Review über alle Routen (fremde `householdId` darf nie erreichbar sein), Invite-Tokens nur gehasht + ablaufend + einmalig, Rate-Limit auf dem Accept-Endpoint, Durchlauf des `security`-Agents vor dem Merge.
- Zwei-User-Integrationstests: User B sieht Haushalt A erst nach Beitritt; Verlassen entzieht den Zugriff sofort.
- **Wechselwirkungen:** Budget-Push (Teil C) geht an alle Mitglieder; 3b-Konflikthinweise können „von {Partner} geändert" anzeigen; optionaler späterer Push „{Partner} hat gebucht".
- **Aufwand: 1–2 Wochen** (Migration + Route-Sweep + Tests dominieren). **Abhängigkeit:** keine harte — empfohlen nach C, **zwingend vor 3b**.

---

## 7. Teil E — Bank-Import: Entscheidungsgrundlage (bewusst noch keine Phase)

### 7.1 Was bringt es überhaupt? (der ehrliche Benefit)
- **Erfassungsaufwand ist Churn-Treiber Nr. 1** jeder manuellen Finanz-App: Sobald Buchungen fehlen, stimmen Review und Budgets nicht mehr, das Vertrauen in die Zahlen kippt, die App wird stillgelegt. Import löst genau das — Vollständigkeit ohne Disziplin.
- **Time-to-Value für neue Nutzer:** Mit Import zeigt die App nach zehn Minuten drei Monate Historie samt Auswertungen; ohne bleibt sie wochenlang leer. Für „viral gehen" ist das der Unterschied zwischen „wow" und „vielleicht später".
- **Gegenposition (ernst zu nehmen):** Die YNAB-Schule argumentiert, manuelles Erfassen **sei** das Feature (bewusster Umgang mit Geld). Für einen disziplinierten 2-Personen-Haushalt ist der Zusatznutzen heute begrenzt — **der Benefit skaliert mit fremden Nutzern, nicht im Eigenbetrieb.**

### 7.2 Klarstellung: „Meine Bank hat keine API" — drei Stufen, die oft verwechselt werden
1. **Datei-Import (CSV/CAMT.053) — geht IMMER, ganz ohne Bank-Verbindung.** Praktisch jedes deutsche Online-Banking bietet einen Umsatz-Export (CSV überall; CAMT bei Sparkassen/Genossenschaftsbanken Standard; ⚠️ Details bankabhängig). Keine Zugangsdaten in der App, keine Regulierung — unabhängig davon, ob die Bank eine „API" hat. Das wäre **E1**: Upload → Spalten-Mapping-Profil je Bank → Dedupe (Hash aus Datum+Betrag+Verwendungszweck) → regelbasierte Kategorie-Vorschläge. Aufwand 3–5 Tage; passt zur Local-First-Story („deine Daten bleiben bei dir").
2. **FinTS/HBCI** — deutscher Standard seit den 90ern; die meisten klassischen Banken unterstützen ihn auch ohne öffentliche REST-API (so arbeiten MoneyMoney/Outbank — allerdings **lokal auf dem Gerät des Nutzers**). ❌ Unbekannt: ob deine Bank dabei ist (Neobanken meist nicht). Entscheidend: Eine **gehostete Web-App**, die mit gespeicherten Bank-Zugangsdaten Konten Dritter abruft, ist ein Kontoinformationsdienst → Regulierung (7.3), plus Bank-Credentials auf dem eigenen Server. Für Doewe-Web: **nicht empfohlen.**
3. **PSD2/XS2A über lizenzierte Aggregatoren** — finAPI (deutsch, BaFin-lizenziert), Tink, Enable Banking u. a.: Nutzer authentifizieren direkt bei ihrer Bank, die AIS-Lizenz des Aggregators deckt die App (Modell je Anbieter prüfen). Recherche-Fund: **GoCardless Bank Account Data (ehem. Nordigen, die bekannte Gratis-Option) nimmt seit Juli 2025 keine Neukunden mehr an** — den kostenlosen Einstieg in diese Welt gibt es nicht mehr, übrig sind Vertrags-/Kostenmodelle pro verbundenem Konto.

### 7.3 Hürden, wenn die App öffentlich skalieren und Geld verdienen soll
- **Regulatorik:** Kontoinformationsdienste erfordern eine **Registrierung nach § 34 ZAG bei der BaFin** inkl. **Berufshaftpflichtversicherung** und laufender Aufsicht (belegt: BaFin/ZAG). Für einen Solo-Betreiber unrealistisch → der Weg führt faktisch nur über Aggregatoren (deren Lizenz), mit Vertragspflichten und Anbieter-Abhängigkeit.
- **DSGVO:** Kontoumsätze sind hochsensibel: AV-Vertrag mit dem Aggregator, Datenschutz-Folgenabschätzung, Lösch- und Auskunftskonzepte, erweiterte Datenschutzerklärung. Ein Breach wäre existenziell — die Sicherheitsmesslatte (Pen-Tests, Incident-Prozesse) steigt deutlich.
- **Unit Economics:** Aggregatoren kosten laufend **pro verbundenem Konto**. Bei Freemium frisst das sofort die Marge → Bank-Sync trägt sich nur als **Bezahl-Feature** (Preis > Kontokosten + Puffer).
- **Betrieb & Support:** Bank-Verbindungen brechen ständig (SCA-Re-Auth-Zyklen, Bank-Umstellungen) — in dieser App-Kategorie erfahrungsgemäß der größte laufende Support-Posten.
- **Vertrauenshürde:** „Verbinde dein Bankkonto mit einer unbekannten App" ist eine massive Konversionsbremse. Umgekehrt ist **„wir verbinden uns NICHT mit deiner Bank — deine Daten bleiben bei dir"** für eine Local-First-PWA ein echtes Marketing-Asset.
- **Beweglicher Grund:** PSD3/PSR sind politisch geeinigt (11/2025, anwendbar voraussichtlich ~2027/28); **FIDA** (Open-Finance-Ausweitung auf Depots, Versicherungen etc.) hängt Stand 04/2026 noch im Trilog, operativ eher 2029+. Wer jetzt tief integriert, baut auf Regeln, die sich gerade ändern.
- Zum Vergleich: **Ohne** Bank-Anbindung bleiben die Pflichten beim Geldverdienen überschaubar (Impressum/Datenschutz existieren als Seiten; dazu kämen AGB, Support-Prozess, USt) — die Bank-Anbindung ist der mit Abstand größte Compliance-Sprung, den diese App machen könnte.

### 7.4 Empfehlung
1. **Jetzt: nichts verbinden.** Teil E blockiert keine der Phasen 1–D.
2. **Wenn Erfassungsaufwand real drückt:** **E1 = CSV/CAMT-Datei-Import** als eigene Phase (3–5 Tage). ~80 % des Nutzens, null Regulierung, stärkt sogar die Privacy-Positionierung.
3. **Nur bei echter Monetarisierung:** Aggregator-Spike (finAPI / Enable Banking) als Premium-Feature mit einem Preismodell, das die Kontokosten trägt.
4. **Nie:** eigene AISP-Registrierung oder serverseitig gespeicherte FinTS-Zugangsdaten.

### 7.5 Entscheidung (2026-08-12): manual-first — der „bewusster Umgang"-Weg

- **Positionierung:** Doewe verbindet sich bewusst **nicht** mit Bankkonten. Manuelles Erfassen ist Teil des Produkts (bewusster Umgang mit Geld), nicht sein Defizit.
- **Zielgruppen-These:** (a) Menschen, die bewussten Umgang mit Geld wollen bzw. bei sich erzwingen möchten, und (b) Menschen mit Skepsis gegenüber Finanz-Apps, die Bank-Zugriff verlangen. Für beide ist „keine Bank-Verbindung — deine Daten bleiben bei dir" ein Kaufargument, kein Mangel.
- **Gegenargument (bewusst zurückgestellt, nicht widerlegt):** „Wenn die Bank dem PSD2-Ökosystem/Aggregator vertraut, kann ich der App auch vertrauen." Legitim — bleibt als späterer Premium-Pfad denkbar (7.4 Punkt 3), aber erst, wenn Monetarisierung real ist und die Kontokosten trägt.
- **Konsequenzen:**
  1. Der **Erfassungs-Reminder (5.3)** wird vom Nice-to-have zum **strategischen Feature** — er macht manual-first alltagstauglich (erinnern statt importieren).
  2. **E1 (CSV/CAMT-Datei-Import)** bleibt der Eskalationspfad, falls Erfassungsaufwand doch zum Churn-Risiko wird — auch er passt zur Positionierung (Datei statt Verbindung, Daten bleiben lokal kontrolliert).
  3. Marketing-/README-Sprache kann die Positionierung aktiv nutzen („local-first, bank-frei, bewusst").

---

## 8. Quellen (Recherche 2026-08-12)
- iOS-Zoom bei < 16px: [CSS-Tricks — 16px or Larger Text Prevents iOS Form Zoom](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/), [Guide Fari — Avoid text-sm on inputs](https://guidefari.com/safari-ios-input-zoom/)
- Serwist-Setup: [Serwist — Getting started (Next.js)](https://serwist.pages.dev/docs/next/getting-started), [LogRocket — Next.js PWA with offline support](https://blog.logrocket.com/nextjs-16-pwa-offline-support/)
- EU/DMA-Kehrtwende: [Apple Developer — Update on apps distributed in the EU](https://developer.apple.com/support/dma-and-apps-in-the-eu/), [Macworld — Home Screen web apps are not going away](https://www.macworld.com/article/2238869/ios-17-4-home-screen-web-apps-digital-markets-act-eu.html)
- iOS 26 „Open as Web App" per Default: [iDownloadBlog](https://www.idownloadblog.com/2025/06/17/apple-ios-26-safari-web-apps-home-screen-bookmarks/), [MacRumors How-To](https://www.macrumors.com/how-to/save-safari-bookmark-web-app-iphone-home-screen/)
- 7-Tage-Regel & installierte Web-Apps ausgenommen: [WebKit — Tracking Prevention](https://webkit.org/tracking-prevention/), [WebKit Blog — Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- iOS-PWA-Fähigkeiten (Push ab 16.4, kein Background Sync): [MobiLoud — PWAs on iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios) · Gegenbeispiel veralteter Quelle: [MagicBell-Guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) (behauptet fälschlich fortbestehende EU-Abschaltung)
- Sync-Engines 2026: [Smashing Magazine — Architecture of Local-First Web Development](https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development/), [InfoQ — Zero 1.0](https://www.infoq.com/news/2026/06/zero-version-1/), [BuildPilot — ElectricSQL vs PowerSync vs Zero](https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026), [PowerSync — electric-next vs PowerSync](https://powersync.com/blog/electricsql-electric-next-vs-powersync) *(Vendor-Quelle, Bias einkalkulieren)*
- Offline-Pattern mit TanStack: [TanStack Query — persistQueryClient](https://tanstack.com/query/v4/docs/react/plugins/persistQueryClient), [TanStack DB — offline-transactions](https://github.com/TanStack/db/tree/main/packages/offline-transactions), [Lucas Barake — Supporting Offline Mode in TanStack Query](https://lucas-barake.github.io/persisting-tantsack-query-data-locally/)

**Ergänzt für Teile C–E (v2, 2026-08-12):**
- Web Push / Declarative Web Push: [Progressier — Declarative Web Push](https://progressier.com/pwa-capabilities/declarative-web-push), [WWDC25 — Declarative Web Push (Zusammenfassung)](https://dev.to/arshtechpro/wwdc-2025-declarative-web-push-dn4), [MobiLoud — PWAs on iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- Open-Banking-Anbieter & GoCardless-BAD-Neukundenstopp (07/2025): [OpenBankingTracker — Best Open Banking API Providers 2026](https://www.openbankingtracker.com/blog/best-open-banking-api-providers-developers-2026), [GoCardless — Bank Account Data Docs](https://developer.gocardless.com/bank-account-data/overview/)
- Regulatorik Kontoinformationsdienst: [BaFin — Zulassungsverfahren nach der PSD2](https://www.bafin.de/DE/Aufsicht/ZahlungsdienstePSD2/ZulassungsverfahrenundLaufendeAufsicht/ZulassungsverfahrenundLaufendeAufsicht_artikel.html), [PayTechLaw — Kontoinformationsdienste: Bin ich betroffen?](https://paytechlaw.com/kontoinformationsdienste-bin-ich-betroffen-bin-ich-es-nicht/), [ZAG Abschnitt 7 — Sonderbestimmungen Kontoinformationsdienste](https://www.buzer.de/gesetz/12696/b29616.htm)
- PSD3/FIDA-Zeitplan: [Crassula — PSD3 & PSR Guide](https://crassula.io/guides/licenses/psd3-psr/), [Deloitte — FiDA-Briefing 2026](https://www.deloitte.com/de/de/our-thinking/industry-thinking/blogs/2026/financial-industry-briefing-fida-2026.html)

**Ergänzt für v3 (Reminder & Standort-Machbarkeit):**
- [Chrome — Notification Triggers API (Origin Trial 2019, nie regulär ausgeliefert)](https://developer.chrome.com/docs/web-platform/notification-triggers)
- [Progressier — Geofencing: nicht im Web verfügbar](https://progressier.com/pwa-capabilities/geofencing)
- [MDN — Re-engageable Notifications & Push](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Re-engageable_Notifications_Push)
