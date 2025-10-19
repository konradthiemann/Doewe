# Copilot Instructions

This document provides guidelines and requirements for using GitHub Copilot in this monorepo. Follow these instructions to ensure code quality, security, and maintainability.

answer in german speech 

# copilot persona rules
Senior Developer 
Professional Prompt Engineering 
UI/UX expert
Senior Dataarchitect
Senior Dataanalyst

work collaborative

## Operator Instruction
- Use Copilot to assist with code generation, refactoring, and documentation.
- Always review Copilot suggestions for correctness, security, and style before committing.
- Prefer Copilot for boilerplate, repetitive tasks, and test scaffolding, but validate logic for business-critical code.
- Reference the main `README.md` and package-level documentation for project-specific conventions.

## Security
- Never commit secrets, credentials, or personal access tokens. Use environment variables for sensitive data.
- Ensure Copilot suggestions do not introduce hardcoded secrets or insecure patterns (e.g., unsafe eval, open CORS, etc.).
- Validate that all dependencies and code comply with organizational security policies.
- Review code for potential vulnerabilities before merging.

## Environment Variables
- Store all sensitive configuration in environment variables, not in code or version control.
- Reference `.npmrc`, `bunfig.toml`, and CI/CD configuration for required environment variables.
- Document any new environment variables in the relevant package `README.md` or the root `README.md`.

## Code Style
- Follow the shared ESLint configuration (`.eslintrc.js`) and TypeScript settings (`tsconfig.json`).
- Use consistent formatting, naming conventions, and modular structure as seen in the workspace.
- Prefer TypeScript for new code and type annotations for clarity and safety.
- Keep code DRY and modular; use shared utilities where possible.

## Change Logging
- All significant changes must be logged in the relevant `CHANGELOG.md` file within each package (if not created, please do so, naming convention: `<package-name>.md`).
- Use conventional commit messages for all commits.
- Document breaking changes, new features, and bug fixes clearly.

## README and Documentation
- Each package must have a `README.md` that describes its purpose, usage, and configuration.
- The root `README.md` should provide an overview of the monorepo, setup instructions, and high-level architecture.
- Use Markdown for documentation; ensure it is clear, concise, and up-to-date.
- Include examples, API references, and configuration details in package `README.md` files.
- Make sure to update documentation when making changes to code or configuration.

## Linting and Formatting
- Use ESLint for linting JavaScript and TypeScript code; ensure it is configured in a .eslintrc professional clean code way.

## Change Logging
- All significant changes must be logged in the relevant `CHANGELOG.md` file within each package (if not created, please do so, naming convention: `<package-name>.md`). 
- Use conventional commit messages for all commits (see Lerna and CI/CD requirements).
- Document breaking changes, new features, and bug fixes clearly and answer following question in this document, what was the reason for this change/implementation, why it was neseccary and how it was implemented (follow implementation guidelines).

## Testing Requirements
- All new features and bug fixes must include appropriate tests.
- Ensure tests are located in the `tests/` or `test/` directory of each package.
- Run tests and type checks before commiting a change.
- Maintain high test coverage and update tests when refactoring.

---
For more details, see the root `README.md`, package-level documentation, and organizational guidelines.

## Project Overview
The goal is to develop a family management system that makes it possible to quickly track finances, set goals and potential expenses, and find data-related patterns, analyze behavior, and identify patterns that could hinder goal achievement.

- This app is for the developer's learning purposes
- It is built and maintained by a software developer (keyword: software selection)

Goals
- Consistent developer experience across the monorepo (apps and packages)
- Strong typing, linting, and testing standards
- Automated CI/CD workflows and reproducible builds

See the top-level `README.md` for setup and architecture notes, and each package `README.md` for package-specific details.

## Repository Structure


Refer to the root `README.md` and each package `README.md` for deeper documentation.

## Coding Standards and Conventions
- check for common professional standards and conventions and update as this project evolves

## Tools, Libraries, and Configurations
- update this part as this project evolves.

## Workflow: small, safe, and incremental
- Do little steps to ensure the best possible quality. Prefer multiple tiny PRs over one large change.
- After finishing a coherent subsection, commit immediately with a descriptive message.
- Always include a clear Goal, Why, and How in the commit body:
	- Goal: what outcome the change targets
	- Why: the motivation and problem it solves (link to `monorepo.md` sections when relevant)
	- How: concise description of edits and affected files, noting whether behavior changes

## Commit policy for completed subsections
- Commit as soon as a subsection is complete and verified locally (lint/typecheck/tests as applicable).
- Use Conventional Commits. Examples:
	- chore(tsconfig): adopt shared baseline in packages/ui-library (no behavior change)
	- chore(eslint): add shared Vue baseline and adopt in ui-library/lib/base (no behavior change)
- Document the change in `monorepoTimeline.md` with Goal/Why/How and affected files.

### Timeline ordering rule
- Always add new entries at the TOP of `monorepoTimeline.md` (newest-first order). Keep the most recent change visible without scrolling.

## Prompt-engineering protocol (for next-step options)
When asking which step to take next, provide 2–5 options and include a copy‑pasteable prompt for each option, written as a professional prompt engineer. Prompts should:
- Be explicit about files to edit, the intended outcome, non‑goals, and acceptance criteria.
- State constraints (no behavior change vs. intentional tightening), and documentation/commit requirements.
- Example option prompts:
	1) “Update `packages/ui-library/lib/forms/.eslintrc.cjs` to extend `../../../../shared/eslint/eslint.vue.cjs`, mirroring existing overrides to avoid behavior changes. Verify lint passes, then document the step in `monorepoTimeline.md` and commit with Goal/Why/How.”
	2) “Enable warning‑level SSR safety in `shared/eslint/eslint.vue.cjs` (`no-restricted-globals` for window/document, `vue/no-setup-props-destructure`). Do not introduce errors; only warnings. Update `monorepoTimeline.md` and commit.”
	3) “Adopt `../../shared/tsconfig/tsconfig.package.json` in `packages/drop-in-library/tsconfig.json`, preserving existing overrides (module/target/lib/paths/include/exclude). Confirm no behavior change. Document and commit.”

	## Try it: next-step question with copy‑paste prompts
	When you’re ready for the next incremental step, ask a focused question and offer 2–5 copy‑pasteable prompts. Example (continuing ESLint centralization):

	- What should we do next to progress ESLint centralization safely?
		1) “Update `packages/ui-library/lib/forms/.eslintrc.cjs` to extend `../../../../shared/eslint/eslint.vue.cjs`, mirroring any existing local overrides. Verify lint passes. Document in `monorepoTimeline.md` and commit with Goal/Why/How.”
		2) “Enable warning‑level SSR safety in `shared/eslint/eslint.vue.cjs` by adding `no-restricted-globals` (window, document) and `vue/no-setup-props-destructure`. Do not introduce errors; only warnings. Update `monorepoTimeline.md` and commit.”
		3) “Wire `.gitlab/ci/package-template.yml` to lint a single UI package by setting `PACKAGE_PATH`, confirming the shared ESLint baseline runs in CI. Document and commit.”
		4) “Extend the shared ESLint baseline to another package under `packages/library/packages/*` with a local `.eslintrc.cjs` and mirror existing overrides to avoid behavior change. Document and commit.”

		## Try it: next-step questions for TypeScript centralization

		- What should we do next to progress TypeScript centralization safely?
			1) “Update one additional library package’s tsconfig (e.g., under `packages/library/packages/*`) to extend `../../shared/tsconfig/tsconfig.package.json`, preserving all current overrides (module, target, lib, paths, include/exclude). Do not change behavior. Verify typecheck passes, then document in `monorepoTimeline.md` and commit with Goal/Why/How.”
			2) “Adopt the shared service baseline in `services/v3shop/tsconfig.json` by extending `../../shared/tsconfig/tsconfig.service.json`, preserving Nuxt-specific includes/excludes and any path aliases. No behavior change. Verify typecheck/build still pass. Document and commit.”
			3) “Document our TS adoption pattern in `shared/tsconfig/README.md`: when to use `tsconfig.package.json` vs `tsconfig.service.json`, common overrides to preserve, and a checklist. Add a short example diff. Document and commit.”
			4) “Add a minimal typecheck task to one package’s `package.json` if missing (e.g., `tsc -p . --noEmit`) and ensure CI runs it via the package template. No behavior change beyond adding the script. Document and commit.”

		Acceptance criteria:
		- No behavior change unless explicitly stated.
		- Typecheck remains green.
		- Timeline updated with Goal/Why/How and affected files.

		## Try it: next-step questions for CI template adoption

		- What should we do next to adopt the shared CI templates safely?
			1) “Include `.gitlab/ci/package-template.yml` in `packages/ui-library/.gitlab-ci.yml` (or the package’s CI file), set `PACKAGE_PATH=packages/ui-library`, and ensure lint/typecheck/test use the shared template. Keep the rest of the pipeline unchanged. Validate pipeline green. Document and commit.”
			2) “Include `.gitlab/ci/service-template.yml` in `.gitlab-ci.yml` for `services/v3shop` with `SERVICE_PATH=services/v3shop`. Wire only the lint and typecheck stages initially to reduce risk. Validate pipeline green. Document and commit.”
			3) “Enable `rules:changes` for a single package in `.gitlab/ci/package-template.yml` so lint/typecheck run only when files under `${PACKAGE_PATH}/` change. Confirm this behavior with a trivial change. Document and commit.”
			4) “Add a short CI usage note to `shared/README.md` describing how to include the templates, set `PACKAGE_PATH` or `SERVICE_PATH`, and expected stages. Link to the templates. Document and commit.”

		Acceptance criteria:
		- Pipeline remains green and scoped to the intended path(s).
		- No publish/deploy changes in this step unless explicitly stated.
		- Timeline updated with Goal/Why/How and affected files.
