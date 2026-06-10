[x] Welche freien Next spezifischen libraries können benutzt werden um die Qualität dieser Anwendung zu verbessern? (Listenform: was, wofür und wie).

## Empfehlungen für Doewe (Stand: Next.js 14 App Router)

### Formulare & Validierung
- **react-hook-form** — Formular-State-Management; ersetzt manuelles `useState` für alle Eingabeformulare (Transaktionen, Budgets). Integration mit Zod via `@hookform/resolvers`.
- **@hookform/resolvers** — Zod-Schema direkt als Formular-Validator verwenden; kein doppeltes Validierungslogik mehr.

### Server Actions & Type Safety
- **next-safe-action** — Typsichere Server Actions mit Zod-Input-Validierung und strukturiertem Error-Handling; ersetzt manuelle fetch-Aufrufe zu eigenen API Routes wo sinnvoll.

### URL-State-Management
- **nuqs** — URL Search Params als React State; ideal für Filter, Sortierung und Pagination in der Transaktionsliste — State bleibt beim Reload erhalten und ist teilbar.

### Datum & Zeit
- **date-fns** — Lightweight Datums-Arithmetik; für Monatsberechnungen, Formatierungen und Datumsvergleiche in Transaktionen/Analytics (kein `new Date()` Boilerplate mehr).

### UI-Qualität
- **clsx** + **tailwind-merge** — Konditionelle Tailwind-Klassen ohne Konflikte; Pflicht sobald Komponenten variante Styles benötigen.
- **class-variance-authority (cva)** — Komponentenvarianten (z.B. Button primary/secondary/danger) typsicher definieren.
- **@radix-ui/react-dialog**, **@radix-ui/react-select**, **@radix-ui/react-dropdown-menu** — Accessible, unstyled UI-Primitives; mit Tailwind stylen — spart Eigenimplementierung von Fokus-Management und ARIA.

### Umgebungsvariablen
- **@t3-oss/env-nextjs** — Typsichere `.env`-Validierung mit Zod beim Build-Start; verhindert Runtime-Fehler durch fehlende Env-Vars.

### Performance & Monitoring
- **@vercel/analytics** — Seitenaufruf-Tracking ohne Cookie-Banner-Pflicht; einfaches `<Analytics />` in Root Layout.
- **@vercel/speed-insights** — Core Web Vitals Monitoring direkt im Vercel Dashboard.

### Testing (optional, aber empfohlen)
- **@testing-library/react** + **@testing-library/user-event** — Komponenten-Tests auf Benutzerinteraktion statt Implementation; ergänzt die bestehenden API-Integrationstests.

---
**Prio-Empfehlung:** `nuqs` + `react-hook-form` + `@hookform/resolvers` haben den größten sofortigen Nutzen für diese App.

---

## Library-Todos

### Formulare & Validierung
[] `react-hook-form` + `@hookform/resolvers` einbauen — manuelles `useState` in allen Formularen (Transaktionen, Budgets) durch react-hook-form ersetzen, Zod-Schemas direkt als Resolver verwenden.

### Server Actions & Type Safety
[] `next-safe-action` evaluieren und einbauen — typsichere Server Actions mit Zod-Validierung einführen, als Alternative zu manuellen fetch-Aufrufen an eigene API Routes.

### URL-State-Management
[] `nuqs` einbauen — Filter, Sortierung und Pagination der Transaktionsliste auf URL Search Params umstellen, damit State beim Reload erhalten bleibt.

### Datum & Zeit
[] `date-fns` einbauen — alle nativen `new Date()`-Operationen für Monatsberechnungen, Formatierungen und Datumsvergleiche in Transaktionen/Analytics auf date-fns migrieren.

### UI-Qualität
[] `clsx` + `tailwind-merge` einbauen — alle konditionellen Tailwind-Klassen in Komponenten darauf umstellen.
[] `class-variance-authority (cva)` einbauen — Komponentenvarianten (Button, Badge etc.) typsicher mit cva definieren.
[] `@radix-ui` Primitives einbauen (dialog, select, dropdown-menu) — eigene Modal- und Dropdown-Implementierungen durch accessible Radix-Primitives ersetzen.

### Umgebungsvariablen
[] `@t3-oss/env-nextjs` einbauen — alle Env-Vars in einem zentralen Schema mit Zod validieren, damit fehlende Vars beim Build-Start sofort auffallen.

### Performance & Monitoring
[] `@vercel/analytics` + `@vercel/speed-insights` einbauen — `<Analytics />` und `<SpeedInsights />` ins Root Layout einfügen.

### Testing
[] `@testing-library/react` + `@testing-library/user-event` einbauen — Komponenten-Tests für kritische UI-Komponenten (Formulare, Charts) aufsetzen.
