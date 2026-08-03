# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, report privately via GitHub's
[**Report a vulnerability**](https://github.com/konradthiemann/Doewe/security/advisories/new)
form (repository **Security** tab → *Advisories* → *Report a vulnerability*).
This keeps the report confidential until a fix is available.

Please include, where possible:

- a description of the issue and its impact,
- steps to reproduce (or a proof of concept),
- affected routes/files and any relevant logs.

You can expect an initial response within a few days. Once confirmed, a fix
will be prepared and, if appropriate, a security advisory published.

## Scope

This is a personal-finance application. Reports about authentication,
authorization (missing session guards on `app/api/*` routes), data exposure,
injection, and secret handling are especially welcome.

## Handling of secrets

Never commit real credentials. Only `.env.example` files with placeholder
values belong in the repository; real values live in untracked `.env` files
(already covered by `.gitignore`) and in the deployment provider's environment
settings. If a secret is ever committed, rotate it immediately — removing it
from later commits does not remove it from git history.
