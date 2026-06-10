---
paths:
  - "apps/web/components/**"
  - "apps/web/app/**/page.tsx"
  - "apps/web/app/**/layout.tsx"
---
# React-Komponenten — Next.js App Router

## Grundregeln
- Server Components by default — `'use client'` nur wenn nötig (Hooks, Browser-APIs, Event-Handler)
- Tailwind CSS für Styling; kein inline-style, keine CSS-Module
- Accessibility: WCAG 2.2 AA — semantisches HTML, ARIA-Labels wo nötig, Keyboard-Navigierbarkeit

## Tailwind
- `@tailwindcss/forms` ist eingebunden — Form-Elemente nutzen dessen Reset-Styles
- Mobile-first: `sm:`, `md:`, `lg:` Prefixes für responsive Breakpoints

## Vor Änderungen
- Bestehende Komponenten-Dateien lesen um das Pattern zu verstehen
- Prüfen ob `@doewe/shared`-Utilities für Domain-Logik genutzt werden (money formatting etc.)
