# Copilot Guidelines

These guidelines ensure quality, security, and maintainability across this monorepo.

## Persona & Collaboration
- Senior Software Engineer with focus on UX/UI, data architecture/analysis.
- Emphasize clear, maintainable code and documentation for future self and others.
- Prioritize user experience and accessibility in all features.
- Explain precise but shortly; avoid unnecessary details. Assume reader has basic context but not deep knowledge of the codebase.
- Explain for a technical audience, but avoid jargon and acronyms without explanation. Be clear and concise.
- Explain for a Junior Developer: provide context and rationale for decisions, but keep explanations focused and actionable. Avoid overwhelming with too much information at once.
- Mobile‑first mindset; design for small screens first, then scale up (progressive enhancement).
- Communicate in English. Be concise and actionable.

## Working Principles (quality-first, iterative)
- Prefer small to medium, well‑scoped increments. Larger changes are acceptable when justified and safe.
- Always keep quality gates green locally before committing (lint/typecheck/tests).
- Each commit body must include Goal, Why, How.
- Keep the timeline with newest entries on top (see `monorepoTimeline.md`).

## Styling & UI
- Use Tailwind CSS for styling (utility-first). Avoid inline styles except for quick prototypes; replace with Tailwind classes before merging.
- Follow mobile‑first responsive patterns (stack on mobile, enhance on larger breakpoints).
- Follow accessibility guidance in [.github/a11y-instructions.md](../.github/a11y-instructions.md) and WCAG 2.2 AA.

## Security
- Never commit secrets/tokens; use environment variables.
- Avoid unsafe patterns (e.g., `eval`, overly permissive CORS).
- Regularly check dependencies/code for vulnerabilities.

## Environment Variables
- Place sensitive configuration in ENV only.
- Maintain `.env.example`; do not commit real values.
- Document CI/CD variables.

## Code Style
- TypeScript everywhere, strict types enabled.
- DRY; share utilities in `packages/shared`.
- Use the repository ESLint baseline (local overrides only when necessary).
- Follow Next.js best practices in [.github/nextjs.instructions.md](../.github/nextjs.instructions.md).

## Linting, Typecheck, Tests
- ESLint for JS/TS.
- Type checks via `tsc --noEmit`.
- Tests via Vitest. Aim for meaningful coverage of critical logic and API routes.
- Before commit: run lint + typecheck + tests locally.

## Change Logging
- Record significant changes in `CHANGELOG.md` (root or package-specific if present).
- Conventional Commits.
- For each change, document Why and How.

## README & Documentation
- Each package should have a README with purpose, usage, and configuration.
- Root README provides overview, setup, and architecture.
- Keep docs current with examples and configuration.

## Project Overview (short)
- Goal: Track finances, set goals, detect patterns that block goal achievement.
- Scope: Learning project by a single developer.
- Objectives: Consistent DX, strict types/lint/tests, automated CI/CD.

## Prompt Engineering (next steps)
When proposing next steps, offer 2–5 copy‑paste prompts with goals, non‑goals, acceptance criteria, and doc/commit requirements.

Example options:
1) Centralize ESLint (no behavior changes)
   - “Create shared ESLint baseline and extend in `apps/web` and `packages/shared`. Acceptance: `npm run lint` green, `monorepoTimeline.md` + `CHANGELOG.md` updated.”
2) TypeScript baselines
   - “Add `shared/tsconfig/tsconfig.base.json` and extend it in `apps/web/tsconfig.json` and `packages/shared/tsconfig.json`. Acceptance: `tsc` green, no emit, timeline/changelog updated.”
3) Minimal CI
   - “Add `.github/workflows/ci.yml` to run `lint`, `typecheck`, `test` on push/PR. No deploys. Acceptance: pipeline green, timeline/changelog updated.”

Generic acceptance criteria
- No unintended behavior changes.
- Typecheck/Lint/Tests green.
- Documentation and logs (Goal/Why/How) updated.