# Claude Design Prompt — Doewe Design System

> **Verwendung:** Diesen gesamten Text als Prompt an Claude (Design/Artifacts-Modus)
> geben. Ziel ist **ein vollständiges, umsetzbares Design-System für Doewe**. Nach
> Lieferung des Systems wird die bestehende App schrittweise darauf umgestellt
> (siehe Abschnitt 8 „Rollout").

---

## 0. Deine Aufgabe (Kurzfassung)

Du bist der Design-Lead für **Doewe**, eine local-first Personal-&-Family-Finance-PWA.
Entwirf ein **kohärentes Design-System** — Tokens, Komponenten, Muster, Light + Dark —
das die Positionierung „**Calm Finance**" trägt und die App vom heutigen
Ad-hoc-Tailwind-Look zu einem ruhigen, vertrauenswürdigen, mobil-first Produkt hebt.
Liefere am Ende einen **Rollout-Plan**, mit dem die bestehende Codebasis darauf
umgestellt werden kann.

Arbeite in dieser Reihenfolge: **Prinzipien → Tokens → Komponenten → Beispielscreens → Rollout.**

---

## 1. Was ist Doewe? (Ziel der App)

Doewe hilft Einzelpersonen und Familien, ihre Finanzen **bewusst** zu führen:
Transaktionen erfassen, Ausgaben kategorisieren, Budgets und Sparziele verfolgen,
wiederkehrende Buchungen verwalten und Auswertungen sehen, die Muster sichtbar
machen. Kern-Alltagsfrage, die die App in **unter 3 Sekunden** beantwortet:

> **„Wie stehe ich diesen Monat da — was ist noch frei?"**

Die Differenzierungs-Kennzahl ist **`projectedLeft`** = *„Was bleibt bis Monatsende,
inklusive noch anstehender Daueraufträge"* — **vorausschauend statt rückblickend**.
Diese Zahl ist die Hero-Größe des Dashboards.

**Bewusste Positionierung (fix entschieden):**
- **manual-first / bank-frei / local-first:** Doewe verbindet sich **bewusst nicht**
  mit Bankkonten. Manuelles Erfassen ist Teil des Produkts (bewusster Umgang mit
  Geld), kein Defizit. „**Deine Daten bleiben bei dir**" ist ein Kaufargument.
- **PWA:** installierbar, offline lesbar & erfassbar, Zwei-Wege-Sync im Haushalt.

---

## 2. Zielgruppe

1. **Bewusste Geldmanager:innen** — Menschen, die bewussten Umgang mit Geld wollen
   (oder bei sich erzwingen möchten). Sie schätzen Disziplin, Klarheit, Kontrolle.
2. **App-Skeptiker:innen** — Menschen mit Vorbehalten gegen Finanz-Apps, die
   Bank-Zugriff verlangen. Für sie ist „keine Bank-Verbindung" vertrauensbildend.
3. **Familien / Haushalte** — zwei (oder mehr) Erwachsene teilen einen Haushalt,
   ein gemeinsames Datenset, mit Rollen (OWNER/MEMBER) und „Wer hat das gebucht?".

**Nutzungskontext:** überwiegend **Smartphone im Porträt** (≈ 375 px), unterwegs,
oft in wenigen Sekunden zwischendurch. Desktop/Tablet als sekundäre, aber
vollwertige Oberfläche. Deutschsprachig (i18n de/en vorhanden).

---

## 3. Design-Haltung: „Calm Finance"

Finanzieller Überblick soll **Mental Load reduzieren**, nicht erhöhen. Das prägt
jede Design-Entscheidung:

- **Ruhig statt alarmierend.** Farbe sparsam; Rot nur wo echte Handlung nötig ist.
  Keine „Schuld"-Ästhetik, keine aggressiven Warnungen.
- **Vorwärtsgerichtet.** Zeige „was noch geht" (verfügbar bis Monatsende) prominenter
  als „was weg ist". Projektion vor Rückblick.
- **Klarheit vor Dichte.** Eine starke Zahl pro Screen, ruhige Hierarchie, großzügiger
  Weißraum. Der:die Nutzer:in soll den Status *fühlen*, nicht *entziffern*.
- **Ehrlich, nie überverkauft.** Wellness-Sprache erlaubt („weniger Geld-Stress durch
  Klarheit", „Kopf frei", „mentale Last reduzieren"). **Medizinische Claims verboten**
  („verbessert deine mentale Gesundheit", „hilft gegen Angst/Depression") — sowohl
  unseriös als auch regulatorisch heikel (DiGA/Medizinprodukt/Heilversprechen).
- **Der Ostrich-Effekt ist ein Design-Auftrag:** Menschen vermeiden den Blick auf ihre
  Finanzen, wenn sie schlechte Nachrichten erwarten. Das UI muss den Blick *leicht und
  angstfrei* machen — sanfte Einstiege, keine Scham, kleine Wins sichtbar.

---

## 4. Das YNAB-Prinzip (konzeptioneller Rahmen)

Doewe steht in der **YNAB-Schule** (You Need A Budget): **manuelles Erfassen IST das
Feature** — der bewusste Akt schafft das Bewusstsein. Übersetze diese Haltung ins
Design:

- **Jeder Euro hat einen Job** → Budgets/Kategorien und Sparziele sind erstklassige
  Bürger, nicht Nebenschauplätze. Zuweisung/Planung soll sich befriedigend anfühlen.
- **Erfassung muss reibungslos sein** — weil sie freiwillig und häufig passiert. Das
  Erfassen-Formular (und der zentrale FAB) ist der meistgenutzte Flow: schnell,
  fehlertolerant, ein-Hand-bedienbar, offline-fähig.
- **Reminder statt Import:** Da nicht importiert wird, erinnert die App ans Dranbleiben.
  Reminder-/Push-Momente sollen *einladend* wirken, nie nörgelnd.
- **Vertrauen in die Zahlen:** Wenn Buchungen fehlen, kippt das Vertrauen. Das Design
  soll Lücken sichtbar und das Nachtragen leicht machen.

---

## 5. Der 60-Sekunden-Aha-Moment (Aktivierung)

Die erste Session entscheidet über Bindung. Ziel: **ein neuer Mensch erlebt in unter
60 Sekunden seinen ersten echten Einblick** — mit **eigenen Zahlen**.

- **Aktivierungs-Prinzip:** Nicht Features zeigen, sondern **einen persönlichen
  Wert liefern**. Der Aha entsteht, wenn die Hero-Karte „Verfügbar bis Monatsende"
  zum ersten Mal **eine echte, eigene Projektion** anzeigt.
- **Mini-Wizard (3 Schritte, überspringbar):** Monatseinkommen → größte Fixkosten
  (legt 1–3 Daueraufträge an) → optional 1 Sparziel. Danach ist die Hero-Karte
  sofort gefüllt. Der Wizard *ist* die erste bewusste Auseinandersetzung (passt zu
  manual-first).
- **Alternativer Einstieg:** „Mit Beispieldaten erkunden" (Demo-Seed vorhanden) mit
  sauberem „Demo beenden/zurücksetzen"-Pfad.
- **Leerer Zustand ≠ Aha.** Entwirf Empty States, die zum ersten Schritt einladen,
  nicht abschrecken.

**Design-Deliverable dazu:** Wizard-Flow (3 Screens), gefüllte vs. leere Hero-Karte,
Empty States für Dashboard/Transaktionen/Sparziele.

---

## 6. Technischer & UX-Kontext (Randbedingungen — bitte einhalten)

**Stack:** Next.js 14 App Router, React 18, **Tailwind CSS 3.4**, `@tailwindcss/forms`,
Chart.js (Doughnut + Bars). Dark Mode via `darkMode: "class"`. Radix-Dialoge im Einsatz.

**Heutiger Ist-Zustand (bewusst mager — das ist der Ausgangspunkt):**
- **Keine Design-Tokens.** `tailwind.config.ts` erweitert nur `fontFamily.sans` auf
  `system-ui`. Farben sind rohe Tailwind-Grautöne (`bg-white`/`text-gray-900` hell,
  `dark:bg-neutral-900`/`dark:text-neutral-100` dunkel) — ad hoc pro Komponente.
- Feedback-Primitive existieren: Toast + Spinner + `<Button loading>`.
  `tailwindcss-animate` ist **nicht** installiert (nur `animate-spin` ist Core).

**Navigation / Layout:**
- **Mobil (<768 px):** untere Pill-Nav mit 5 Tabs (Dashboard, Transactions, Saving
  Plan, Review, Settings) + **zentraler FAB** zum Erfassen. `safe-area` beachten.
- **≥ md:** persistente **linke Sidebar** ersetzt Bottom-Nav; Sekundär-Nav (Settings,
  Categories, Tax, Impressum, Datenschutz + Logout) in Drawer/Sidebar.
- Shared `PageContainer`/`MainContainer` für Seitenbreite.

**Screens (Seiten):** Dashboard (`/`), Transactions, Saving Plan, Review, Budgets,
Categories, Tax, Settings, Login, Forgot/Reset-Password, Haushalt beitreten, Offline-Fallback.

**Komponenten heute:** TransactionForm, RecurringTransactionForm, PlannedSavingForm,
SearchableSelect, AttachmentManager, HouseholdCard, NotificationsCard, InstallAppCard,
OfflineBanner, Header (Bottom-Nav), Sidebar, AppChrome, BackToTopButton, Legal*.

**Harte Regeln, die das visuelle System respektieren muss:**
- **Mobile-first, additiv.** Basis-Styles fürs Handy, `md:`-Aufsätze für größer.
- **Geld = Cents (Integer)**, erst bei der Ausgabe /100. Beträge brauchen
  **`tabular-nums`** und dürfen bei 375 px in halber Kartenbreite **nicht umbrechen**
  → große Beträge eher `text-lg`/`text-xl` als `text-2xl`; Zahlengrößen im
  Token-System als eigene Skala definieren.
- **KPI-Karten `grid-cols-2` ab Basis-Breakpoint** (validiert), max. 4 Karten;
  Grid-/Flex-Kinder mit breitem Inhalt brauchen **`min-w-0`** (bekanntes Overflow-Gotcha).
- **A11y: WCAG 2.2 AA.** Kontrast (auch für income/expense-Farben in beiden Themes),
  Fokus-Ringe, Touch-Targets ≥ 44 px, `prefers-reduced-motion` respektieren,
  Semantik/ARIA. Farbe nie als *einziger* Bedeutungsträger.
- Keine Inline-Styles (Tailwind-Utilities/Tokens).

---

## 7. Was du liefern sollst (das Design-System)

Struktur die Antwort als **Design-System-Dokument** mit diesen Teilen:

### 7.1 Design-Prinzipien
5–7 knappe, für Doewe spezifische Prinzipien (aus Abschnitt 3–4 abgeleitet), je mit
1 Satz „das heißt konkret …".

### 7.2 Tokens (als konkrete Werte, Light **und** Dark)
Gib Tokens sowohl **semantisch benannt** als auch als **Tailwind-`theme.extend`-Config**
(damit sie 1:1 übernehmbar sind), plus optional CSS-Variablen für Theming:
- **Farbe:** neutrale Skala; **eine ruhige Markenfarbe** (Primär) + Akzent; **semantische
  Finanzfarben**: `income` (positiv), `expense` (negativ), `savings`, plus Status
  `success`/`warning`/`danger`/`info`. Für jede: Werte für Light + Dark, mit
  geprüftem Kontrast. Halte Rot bewusst zurück (Calm Finance).
- **Typografie:** Font-Stack (bleibt system-ui-basiert, ggf. eine optionale Display-
  Schrift vorschlagen), Typ-Skala inkl. **separater Zahlen-/Betrags-Skala** (`tabular-nums`).
- **Spacing, Radius, Border, Elevation/Shadow, Z-Index-Leiter** (Bottom-Nav über
  Content, Drawer/Overlay über allem — bestehende Stapelung berücksichtigen).
- **Motion:** Dauer/Easing-Tokens; sanft, reduziert bei `prefers-reduced-motion`.
  Beachte: nur `animate-spin` ist verfügbar — schlage vor, welche Utilities/Keyframes
  ergänzt werden müssten.

### 7.3 Komponenten-Spezifikationen
Für jede: Anatomie, Varianten, States (default/hover/focus/active/disabled/loading),
Light+Dark, A11y-Hinweise. Mindestens:
- **Hero-Karte „Verfügbar bis Monatsende"** (große Zahl + Mini-Segmentbalken
  ausgegeben/gespart/frei + Kontextzeile „inkl. n anstehender Daueraufträge, Übertrag x €").
- **KPI-Karte** (2-Spalten-Grid, `tabular-nums`, `min-w-0`).
- **Budget-Ampel** (kompakt, worst-first, ruhige Skala statt grell).
- **Transaktions-Zeile/-Karte** (Betrag income/expense farbcodiert + Icon, „von {Name}"-Badge).
- **Buttons** (primär/sekundär/ghost/destruktiv + loading), **FAB** (zentral, Bottom-Nav).
- **Formfelder** (`@tailwindcss/forms`-kompatibel), **SearchableSelect**, Amount-Input.
- **Bottom-Nav + Sidebar** (aktiver Zustand), **Toast**, **Badge/Chip**, **Skeleton-Loader**
  (statt „Lädt…"-Text), **Empty State**, **Dialog** (Radix), **Segmentbalken/Progress**.
- **Chart-Theming** für Chart.js (Doughnut/Bars) aus den Tokens (Farben, Grid, Labels,
  Dark Mode).

### 7.4 Muster & Beispielscreens
Zeige das System an **mind. 3 Screens**: (1) Dashboard mobil 375 px (hell + dunkel),
(2) Erfassen-Formular, (3) 60-Sekunden-Wizard oder gefüllte vs. leere Hero. Als
HTML/CSS- oder React/Tailwind-Artifact, damit man es real sieht.

---

## 8. Rollout — wie die App danach umgestellt wird

Liefere zum Schluss einen **pragmatischen, inkrementellen Migrationsplan** (keine
Big-Bang-Neuentwicklung), passend zum Repo:
1. **Tokens zuerst:** `tailwind.config.ts` um `theme.extend` (Farben/Typo/Spacing/Radius/
   Shadow/Motion) + ggf. CSS-Variablen in `globals.css` erweitern — ohne bestehende
   Screens zu brechen.
2. **Primitive angleichen:** Button/Card/Input/Badge/Skeleton auf Tokens heben
   (bestehende Toast/Spinner-Primitive einbeziehen).
3. **Screen für Screen**, beginnend mit dem **Dashboard** (höchster Aktivierungs-Hebel:
   Hero-Karte + 2-Spalten-KPIs + Skeletons), dann Erfassen, dann der Rest.
4. **Definition of Done je Screen:** Preview bei 375 px ohne horizontalen Overflow
   (`min-w-0`-Check), hell **und** dunkel, AA-Kontrast, `prefers-reduced-motion`,
   i18n de/en intakt, Beträge `tabular-nums` ohne Umbruch.
5. Nenne pro Schritt die **betroffenen Dateien** grob (Config, `globals.css`, Primitive,
   `app/page.tsx` …) und mögliche Fallstricke.

---

## 9. Erfolgskriterien (woran wir das fertige System messen)

- Ein Fremder versteht „was ist diesen Monat noch frei?" auf dem Dashboard **ohne Scrollen**, mobil.
- Das System fühlt sich **ruhig und vertrauenswürdig** an — nicht wie ein Alarm-Dashboard.
- Light **und** Dark sind gleichwertig, AA-konform, mit stimmigen Finanzfarben.
- Alle Tokens sind als Tailwind-Config **direkt übernehmbar**; Komponenten sind ohne
  Rätselraten implementierbar.
- Der Rollout ist inkrementell und respektiert die bestehenden Layout-/A11y-Regeln.

> **Bitte stelle mir 3–5 gezielte Rückfragen, falls etwas die Richtung grundlegend
> ändert** (z. B. optionale Markenschrift, Farb-Grundstimmung). Sonst leg direkt los —
> beginne mit Prinzipien und Tokens.
