# Doewe Design System — "Calm Finance"

This folder is the source of truth for Doewe's visual language.

## Contents

| File | Purpose |
| --- | --- |
| [`design-system.html`](design-system.html) | The full, self-contained design-system reference (tokens, components, example screens). Open it in a browser to view. |
| [`claude-design-prompt.md`](claude-design-prompt.md) | The brief that generated the system: target audience, product goal, "Calm Finance" stance, constraints, and deliverable spec. |
| [`logo/`](logo/) | Brand marks and lockups as SVG (app icon, favicon, light/dark lockups and marks). |

## Viewing `design-system.html`

GitHub does not render raw HTML in-page. To view it:

- Clone the repo and open `docs/design/design-system.html` in any browser, or
- Use a raw-HTML preview (e.g. `https://htmlpreview.github.io/?<raw-url-of-the-file>`).

## Using the tokens

Tokens are implemented as Tailwind classes backed by CSS variables (RGB triplets so
`<alpha-value>` works) with `darkMode: "class"`. They adapt to light and dark
automatically — do **not** add `dark:` neutral variants.

Key groups:

- **Surfaces:** `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `border-line-strong`
- **Ink:** `text-ink`, `text-ink-muted`, `text-ink-faint`
- **Brand:** `brand`, `brand-hover`, `brand-soft`, `brand-on`
- **Financial:** `income`/`income-soft`, `expense`/`expense-soft`, `savings`/`savings-soft`
- **Status:** `success`, `warning`, `danger`, `info` (each with a `-soft` companion)
- **Radius/Shadow:** `rounded-field`, `rounded-card`, `shadow-card`, `shadow-raised`, `shadow-fab`
- **Z-index:** `z-header`, `z-nav`, `z-overlay`, `z-modal`, `z-toast`

Color decisions are context-sensitive: financial red = `expense`, form-validation
red = `danger`, budget/health indicators = `success`/`warning`; income green =
`income`; brand accents = `brand`.
