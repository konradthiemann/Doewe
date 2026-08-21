# Doewe — API Reference

All routes are HTTP JSON APIs served under `/api`. Every route requires an active session unless noted otherwise. Each route handler enforces authentication itself: it calls `getSessionUser()` (from `apps/web/lib/auth.ts`) and returns `401 { "error": "Unauthorized" }` when there is no session.

**Base URL:** `https://<your-domain>/api`

**Auth mechanism:** Session cookie set by NextAuth on successful login. Include credentials in fetch calls (`credentials: "include"` or `same-origin`).

**Money units:** CRUD endpoints (transactions, budgets, saving plan, …) accept and return **integer euro cents** (`amountCents`). Exception: `GET /api/analytics/summary` divides by 100 at the output step and returns **euro** values; `GET /api/analytics/quarterly` and `GET /api/analytics/monthly-review` return cents (fields suffixed `…Cents`).

**Error format:**
```json
{ "error": "Human-readable message" }
```
Exception: when Zod validation fails, `error` is not a string but the object produced by `error.flatten()` (with `fieldErrors` / `formErrors`).

---

## Authentication

### `POST /api/auth/register`

Register a new user account. Also bootstraps the new user: a default account named `"Main Account"` plus a default category set (income: Salary, Bonus, Other income; expenses: Groceries, Rent, Utilities, Transport, Entertainment, Health, Misc; plus the protected `Savings` category).

**Auth required:** No

**Request body:**
```json
{
  "email": "anna@example.de",
  "password": "min8chars",
  "name": "Anna"
}
```

| Field | Type | Constraints |
|---|---|---|
| `email` | string | Valid email format, unique |
| `password` | string | Minimum 8 characters |
| `name` | string | Optional display name (trimmed; empty → stored as `null`) |

**Success response — `201 Created`:**
```json
{ "id": "usr_01", "email": "anna@example.de", "account": { "id": "acc_01", "name": "Main Account" } }
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Missing or invalid fields (Zod `flatten()` object) |
| `409` | Email already registered (`"User already exists"`) |

---

### `POST /api/auth/[...nextauth]`

NextAuth handler for sign-in, sign-out, and session management. Follows the NextAuth protocol — use the NextAuth client library or direct credential POST.

**Auth required:** No (for sign-in)

**Sign-in POST body:**
```json
{ "email": "anna@example.de", "password": "secret", "csrfToken": "..." }
```

**Success:** Sets session cookie, redirects or returns session JSON depending on `callbackUrl`.

Sessions are **JWT** (no database session table). Each JWT is stamped with the user's
`passwordChangedAt`; the `jwt` callback re-reads that value from the DB on every request
and rejects tokens issued before the last password change. A password reset or change
therefore **evicts all other active sessions**.

> Only email/password (Credentials) sign-in is available in this build. There is **no**
> OAuth/Google provider wired up (`authOptions.ts` registers `CredentialsProvider` only).

---

### `POST /api/auth/forgot-password`

Starts the "forgot password" flow. Always returns a generic `200` — it never reveals
whether an account exists (anti-enumeration), and the outbound email is sent
fire-and-forget so response timing does not leak account existence.

**Auth required:** No

**Request body:**
```json
{ "email": "anna@example.de", "locale": "de" }
```

| Field | Type | Constraints |
|---|---|---|
| `email` | string | Valid email format |
| `locale` | `"de" \| "en"` | Optional — email language |

**Success response — `200 OK`:** `{ "ok": true }` (same answer for unknown/invalid emails)

**Rate limits:** 5/15 min per IP, 5/60 min per email (`429` on exceed).

When the email exists, a single-use reset token (only its SHA-256 hash is stored) is
created with a limited TTL, any previous tokens are invalidated, and a link to
`/reset-password?token=…` is emailed. The link's base URL comes from `NEXTAUTH_URL`
(never the request `Host` header in production — prevents host-header injection).

---

### `GET /api/auth/reset-password?token=…`

Pre-checks a reset link before showing the form.

**Auth required:** No

**Success response — `200 OK`:** `{ "valid": true }` (false if missing, used, or expired)

**Rate limit:** 30/15 min per IP.

---

### `POST /api/auth/reset-password`

Completes the reset with a valid token. Consumes the token (single-use), drops the
user's other reset tokens, sets `passwordChangedAt` (evicting old sessions).

**Auth required:** No

**Request body:**
```json
{ "token": "…", "newPassword": "min8chars" }
```

| Field | Type | Constraints |
|---|---|---|
| `token` | string | Non-empty; must be unused and unexpired |
| `newPassword` | string | Minimum 8 characters |

**Success response — `200 OK`:** `{ "ok": true }`

| Status | Reason |
|---|---|
| `400` | Missing/invalid fields, or `INVALID_OR_EXPIRED_TOKEN` |
| `429` | Rate limit (10/15 min per IP) |

---

### `POST /api/auth/change-password`

Authenticated password change from Settings. Verifies the current password, rejects an
unchanged password, sets `passwordChangedAt` (evicting other sessions), and invalidates
outstanding reset links.

**Auth required:** Yes

**Request body:**
```json
{ "currentPassword": "…", "newPassword": "min8chars" }
```

**Success response — `200 OK`:** `{ "ok": true }`

| Status | Reason |
|---|---|
| `400` | Invalid fields, `INVALID_CURRENT_PASSWORD`, or `SAME_PASSWORD` |
| `401` | Unauthorized |
| `429` | Rate limit (10/15 min per user) |

---

## Accounts

### `GET /api/accounts`

List all accounts belonging to the authenticated user, newest first (`createdAt desc`).

**Auth required:** Yes

**Request body:** None

**Success response — `200 OK`:**
```json
[
  { "id": "acc_01", "name": "Girokonto", "userId": "usr_01", "createdAt": "2026-01-01T00:00:00.000Z" }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/accounts`

Create a new account for the authenticated user.

**Auth required:** Yes

**Request body:**
```json
{ "name": "Tagesgeldkonto" }
```

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required; non-empty |

**Success response — `201 Created`:** Full account object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (Zod `flatten()` object) |
| `401` | Not authenticated |

---

## Categories

### `GET /api/categories`

List all categories belonging to the authenticated user. Default order: `createdAt desc`.

**Auth required:** Yes

**Query parameters (optional):**

| Parameter | Type | Description |
|---|---|---|
| `sortByUsage` | `"true"` | Sort by usage count (number of linked transactions) descending, ties by name. Each item then also includes a `usageCount` field |

**Success response — `200 OK`:**
```json
[
  { "id": "cat_01", "name": "Gehalt", "isIncome": true, "userId": "usr_01" },
  { "id": "cat_02", "name": "Lebensmittel", "isIncome": false, "userId": "usr_01" }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/categories`

Create a new category.

**Auth required:** Yes

**Request body:**
```json
{
  "name": "Lebensmittel",
  "isIncome": false
}
```

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Non-empty; unique per user; the reserved names `"savings"` / `"sparen"` (case-insensitive) are rejected |
| `isIncome` | boolean | Optional, defaults to `false`. `true` for income, `false` for expense |
| `isTaxRelevant` | boolean | Optional, defaults to `false`. Selecting the category in the transaction form pre-enables the tax toggle |

**Success response — `201 Created`:**
```json
{ "id": "cat_02", "name": "Lebensmittel", "isIncome": false, "isTaxRelevant": false, "userId": "usr_01" }
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Missing or invalid fields |
| `401` | Not authenticated |
| `403` | Name is reserved (`"This category name is reserved"`) |
| `409` | Category name already exists for this user |
| `500` | Unexpected failure while creating |

---

### `PATCH /api/categories/[id]`

Rename a category, toggle its tax relevance, **or** merge it into another one. The protected savings category (`"savings"` / `"sparen"`) cannot be modified.

**Auth required:** Yes

**Request body (at least one field required):**
```json
{ "name": "Supermarkt" }
```
or
```json
{ "isTaxRelevant": true }
```
or
```json
{ "mergeIntoCategoryId": "cat_09" }
```

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Optional; new name (unique per user) |
| `isTaxRelevant` | boolean | Optional. `true` marks the category as tax-relevant **and retroactively earmarks all existing transactions of the category** (`taxRelevant: true`); new transactions inherit the flag by default. `false` unmarks only the category — transaction flags are kept |
| `mergeIntoCategoryId` | string | Optional; target category. All transactions, recurring transactions, and budgets of this category are reassigned to the target, then this category is deleted. Takes precedence over the other fields |

**Success response — `200 OK`:** The updated category (rename) or the merge target category (merge).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | No update fields, or merge target equals source |
| `401` | Not authenticated |
| `403` | Category is protected (`savings`/`sparen`) |
| `404` | Category (or merge target) not found or not owned by user |
| `409` | Rename/merge would violate a unique constraint (duplicate name or budget) |

---

### `DELETE /api/categories/[id]`

Delete a category. A **fallback category is mandatory**: all transactions, recurring transactions, and budgets of the deleted category are reassigned to it. The protected savings category cannot be deleted.

**Auth required:** Yes

**Request body (exactly one of the two fields required):**
```json
{ "fallbackCategoryId": "cat_09" }
```
or
```json
{ "fallbackName": "Sonstiges" }
```

| Field | Type | Constraints |
|---|---|---|
| `fallbackCategoryId` | string | Existing category to reassign records to (must not be the deleted one) |
| `fallbackName` | string | Name for a new fallback category, created with the same `isIncome` as the deleted one |

**Success response — `200 OK`:**
```json
{ "success": true, "fallbackCategoryId": "cat_09" }
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Fallback missing, or fallback equals the deleted category |
| `401` | Not authenticated |
| `403` | Category is protected (`savings`/`sparen`) |
| `404` | Category or fallback category not found / not owned by user |
| `409` | Fallback name already exists, or reassignment would create duplicates |

---

## Transactions

### `GET /api/transactions`

List **all** transactions for the authenticated user across all accounts, ordered by `occurredAt` descending. There are no query parameters — filtering happens client-side.

**Auth required:** Yes

**Success response — `200 OK`:**
```json
[
  {
    "id": "txn_01",
    "accountId": "acc_01",
    "categoryId": "cat_01",
    "savingGoalId": null,
    "amountCents": 320000,
    "description": "Gehalt April",
    "occurredAt": "2026-04-01T00:00:00.000Z",
    "taxRelevant": false,
    "createdAt": "2026-04-01T08:00:00.000Z"
  }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/transactions`

Create a new transaction.

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "categoryId": "cat_02",
  "amountCents": -6340,
  "description": "Rewe",
  "occurredAt": "2026-04-05T00:00:00.000Z"
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Required; must belong to user |
| `categoryId` | string | Optional. **Omit** the field entirely — an explicit `null` fails validation |
| `savingGoalId` | string | Optional; ID of a saving goal (`Budget` row). Omit rather than sending `null` |
| `amountCents` | integer | Required; negative for expense, positive for income (no non-zero check — `0` is accepted) |
| `description` | string | Required; non-empty |
| `occurredAt` | ISO date string | Required |
| `taxRelevant` | boolean | Optional. Earmarks the transaction for the tax return (see [Attachments](#attachments-receipts)). When omitted, defaults to the category's `isTaxRelevant` (else `false`); an explicit value always wins |

**Success response — `201 Created`:** Full transaction object (same shape as GET list item).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (Zod `flatten()` object) |
| `401` | Not authenticated |
| `404` | Account, category, or saving goal not found / not owned by user |

---

### `PATCH /api/transactions/[id]`

Update an existing transaction. **Not a partial update** — the request is validated against the same schema as `POST`, so `accountId`, `amountCents`, `description`, and `occurredAt` are required; `categoryId`/`savingGoalId` stay optional (omit instead of `null`). `taxRelevant` is optional; when omitted, the stored value is kept (the flag is never silently cleared).

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "categoryId": "cat_02",
  "amountCents": -7000,
  "description": "Rewe updated",
  "occurredAt": "2026-04-06T00:00:00.000Z"
}
```

**Success response — `200 OK`:** Updated transaction object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Transaction not found or not owned by user |

---

### `DELETE /api/transactions/[id]`

Delete a transaction by ID.

**Auth required:** Yes

**Request body:** None

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Transaction not found or not owned by user |

---

## Attachments (Receipts)

Receipt files (photos/PDFs) attached to transactions as evidence for the German tax return (Belegvorhaltepflicht — receipts are archived, not submitted). Files are stored as bytes in PostgreSQL. Limits: allowed types `image/jpeg`, `image/png`, `image/webp`, `application/pdf`; max. **5 MB** per file; max. **5 attachments** per transaction. List/metadata responses never contain the file bytes.

### `GET /api/transactions/[id]/attachments`

List attachment metadata for one transaction, ordered by `createdAt` ascending.

**Auth required:** Yes

**Success response — `200 OK`:**
```json
[
  {
    "id": "att_01",
    "fileName": "quittung.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 482113,
    "createdAt": "2026-07-10T10:00:00.000Z"
  }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Transaction not found or not owned by user |

---

### `POST /api/transactions/[id]/attachments`

Upload a receipt as `multipart/form-data` with a single field named `file`.

**Auth required:** Yes

**Request body:** multipart form data

| Field | Type | Constraints |
|---|---|---|
| `file` | file | Required; type in the whitelist; ≤ 5 MB (validated against the actual bytes, not the client-reported size) |

**Success response — `201 Created`:** Attachment metadata (same shape as the list item above, no bytes).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Missing/empty file, body is not multipart, or the 5-attachments-per-transaction limit is reached |
| `401` | Not authenticated |
| `404` | Transaction not found or not owned by user |
| `413` | File larger than 5 MB |
| `415` | File type not in the whitelist |

---

### `GET /api/attachments/[id]`

Download the receipt file. Responds with the raw bytes, `Content-Type` set to the stored MIME type, `Content-Disposition: inline; filename="…"`, and `Cache-Control: private, no-store` (content is auth-gated).

**Auth required:** Yes

**Success response — `200 OK`:** Binary file body.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Attachment not found or not owned by user (ownership via transaction → account → user) |

---

### `DELETE /api/attachments/[id]`

Delete a receipt.

**Auth required:** Yes

**Request body:** None

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Attachment not found or not owned by user |

---

## Tax

### `GET /api/tax?year=…`

All tax-earmarked transactions (`taxRelevant: true`) of one calendar year (UTC boundaries on `occurredAt`), with category info, attachment metadata, and per-category sums. Backs the `/tax` page.

**Auth required:** Yes

**Query parameters:**

| Parameter | Type | Constraints |
|---|---|---|
| `year` | integer | Optional, defaults to the current year. Must be 2000–2100, otherwise `400` |

**Success response — `200 OK`:**
```json
{
  "year": 2026,
  "transactions": [
    {
      "id": "txn_07",
      "amountCents": -18900,
      "description": "Fachbuch",
      "occurredAt": "2026-03-12T00:00:00.000Z",
      "category": { "id": "cat_05", "name": "Weiterbildung" },
      "attachments": [
        { "id": "att_01", "fileName": "quittung.jpg", "mimeType": "image/jpeg", "sizeBytes": 482113 }
      ]
    }
  ],
  "categorySums": [
    {
      "categoryId": "cat_05",
      "categoryName": "Weiterbildung",
      "totalCents": -18900,
      "count": 1,
      "withReceiptCount": 1
    }
  ]
}
```

`categorySums` is sorted by `|totalCents|` descending; transactions without a category are grouped under `categoryId: null`. Attachment entries contain metadata only, never bytes.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Invalid `year` parameter |
| `401` | Not authenticated |

---

### `GET /api/tax/export?year=…&includeReceipts=0|1&locale=de|en`

Renders the same tax-earmarked transaction set as `GET /api/tax` into a single PDF: a cover page (household, generation date, position/receipt counts, separate income/expense totals plus the grand total), a category-grouped transaction table (running number, date, description, amount, receipt reference), and — when `includeReceipts=1` — a receipt appendix with one page per attachment.

**Auth required:** Yes. Rate-limited to 5 exports per user per 10 minutes.

**Query parameters:**

| Parameter | Type | Constraints |
|---|---|---|
| `year` | integer | Optional, defaults to the current year. Must be 2000–2100, otherwise `400` |
| `includeReceipts` | `"0"` \| `"1"` | Optional, defaults to `"1"`. When `"0"`, no receipt bytes are loaded and the PDF has no appendix |
| `locale` | `"de"` \| `"en"` | Optional, defaults to the requesting user's `locale` field (falls back to `"de"`) |

**Success response — `200 OK`:** binary PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="steuer-<year>.pdf"`, `Cache-Control: private, no-store`).

Receipt handling in the appendix: `application/pdf` receipts are embedded page-for-page (`copyPages`) with a header overlay on the first page; `image/jpeg`/`image/png` are embedded and scaled to fit; `image/webp` always gets a placeholder page (no conversion) with the file name; a receipt whose bytes fail to parse/embed also falls back to a placeholder — a single bad receipt never fails the whole export. Multiple receipts on one transaction are labelled `12a`, `12b`, … in both the table and the appendix.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Invalid `year`, `includeReceipts`, or `locale` parameter |
| `401` | Not authenticated |
| `413` | `includeReceipts=1` and the sum of the household's attachment `sizeBytes` for the year exceeds the 50 MB budget — body: `{ "error": "...", "totalBytes": number, "limitBytes": 52428800 }`. Retry with `includeReceipts=0` |
| `429` | Rate limit exceeded |

---

## Recurring Transactions

### `GET /api/recurring-transactions`

List all recurring transactions for the authenticated user. Skip records are **not** included — fetch them via `GET /api/recurring-transactions/skips`.

**Auth required:** Yes

**Request body:** None

**Success response — `200 OK`:**
```json
[
  {
    "id": "rec_01",
    "accountId": "acc_01",
    "categoryId": "cat_03",
    "amountCents": -85000,
    "description": "Miete",
    "frequency": "MONTHLY",
    "intervalMonths": 1,
    "dayOfMonth": 1,
    "nextOccurrence": "2026-05-01T00:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/recurring-transactions`

Create a new recurring transaction template. `frequency` is set server-side to `"MONTHLY"`; the actual cadence is controlled by `intervalMonths`. By default `nextOccurrence` is computed from `dayOfMonth` (this month if the day hasn't passed yet, otherwise next month). Optionally pass a `startDate` (`yyyy-mm-dd`) to pin the first occurrence to a specific date — e.g. a subscription whose first charge is a few months out.

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "categoryId": "cat_03",
  "amountCents": -85000,
  "description": "Miete",
  "intervalMonths": 1,
  "dayOfMonth": 1,
  "startDate": "2026-10-01"
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Required; must belong to user |
| `categoryId` | string | Optional |
| `amountCents` | integer | Required |
| `description` | string | Required; non-empty |
| `intervalMonths` | integer | Optional; 1–24, defaults to `1` (e.g., `3` = quarterly) |
| `dayOfMonth` | integer | Optional; 1–31, defaults to `1` |
| `startDate` | string | Optional; `yyyy-mm-dd`. When set, becomes `nextOccurrence` (the first occurrence); otherwise `nextOccurrence` is derived from `dayOfMonth` |

**Success response — `201 Created`:** Full recurring transaction object (with computed `nextOccurrence` and `frequency: "MONTHLY"`).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Account or category not found / not owned by user |

---

### `PATCH /api/recurring-transactions/[id]`

Update a recurring transaction template. Partial update — send only changed fields. Accepts the same fields as the create endpoint. When `startDate` (`yyyy-mm-dd`) is supplied, `nextOccurrence` is set to that date; otherwise, if `dayOfMonth` changes, `nextOccurrence` is recomputed from it.

**Auth required:** Yes

**Success response — `200 OK`:** Updated recurring transaction object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Not found or not owned by user |

---

### `DELETE /api/recurring-transactions/[id]`

Delete a recurring transaction template and all its skip records (cascading delete).

**Auth required:** Yes

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Not found or not owned by user |

---

## Recurring Transaction Skips

### `GET /api/recurring-transactions/skips?year=…&month=…`

List the skips of **one calendar month** across all recurring transactions belonging to the authenticated user.

**Auth required:** Yes

**Query parameters (required):**

| Parameter | Type | Description |
|---|---|---|
| `year` | integer | Calendar year |
| `month` | integer | Calendar month (1–12) |

**Success response — `200 OK`:**
```json
[
  { "recurringId": "rec_01", "year": 2026, "month": 5 }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | `Missing year or month` |
| `401` | Not authenticated |

---

### `POST /api/recurring-transactions/skips`

Skip a specific month for a recurring transaction. **Idempotent** — the route upserts, so skipping an already-skipped month simply returns the existing record with `201`.

**Auth required:** Yes

**Request body:**
```json
{
  "recurringId": "rec_01",
  "year": 2026,
  "month": 5
}
```

| Field | Type | Constraints |
|---|---|---|
| `recurringId` | string | Must belong to user (via account) |
| `year` | integer | Calendar year |
| `month` | integer | 1–12 |

**Success response — `201 Created`:**
```json
{ "id": "skp_01", "recurringId": "rec_01", "year": 2026, "month": 5 }
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Recurring transaction not found or not owned by user |

---

### `DELETE /api/recurring-transactions/skips`

Remove a skip (un-skip a month). Uses `deleteMany` — the response is `204` whether or not a matching skip record existed.

**Auth required:** Yes

**Request body:**
```json
{
  "recurringId": "rec_01",
  "year": 2026,
  "month": 5
}
```

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Recurring transaction not found or not owned by user |

---

## Budgets

### `GET /api/budgets`

List **all** budget rows of the authenticated user — including saving goals (`categoryId = null`) — ordered by `year desc, month desc`. There are no query parameters.

**Auth required:** Yes

**Success response — `200 OK`:**
```json
[
  {
    "id": "bud_01",
    "accountId": "acc_01",
    "categoryId": "cat_02",
    "title": "",
    "month": 4,
    "year": 2026,
    "amountCents": 20000,
    "completedAt": null,
    "spentCents": null,
    "createdAt": "2026-04-01T00:00:00.000Z"
  }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/budgets`

Create a new category budget for a month. (Saving goals are created via `POST /api/saving-plan` instead.)

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "categoryId": "cat_02",
  "month": 4,
  "year": 2026,
  "amountCents": 20000
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Required; must belong to user |
| `categoryId` | string | Optional (omitting it creates a saving-goal-like row); unique per (account, category, month, year) |
| `month` | integer | Required; 1–12 |
| `year` | integer | Required; 1970–9999 |
| `amountCents` | integer | Required (no positivity check) |

There is **no `title` field** in the schema — the DB default `""` is used.

**Success response — `201 Created`:** Full budget object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Account or category not found / not owned by user |
| `500` | Duplicate (account, category, month, year) — the unique-constraint violation is not caught explicitly |

---

## Saving Plan

### `GET /api/saving-plan`

List saving goals for the authenticated user plus the computed plan totals. Saving goals are stored as `Budget` rows with `categoryId = null`.

**Auth required:** Yes

**Success response — `200 OK`:**
```json
{
  "goals": [
    {
      "id": "bud_07",
      "accountId": "acc_01",
      "categoryId": null,
      "categoryName": null,
      "title": "Urlaub 2027",
      "month": 6,
      "year": 2027,
      "amountCents": 300000,
      "transactionSpentCents": 50000,
      "completedAt": null,
      "spentCents": null,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "undatedGoals": [],
  "completedGoals": [],
  "totals": {
    "rawAvailableCents": 200000,
    "withdrawnForCompletedCents": 115000,
    "availableCents": 85000,
    "totalTargetCents": 300000,
    "suggestedMonthlyCents": 21667
  }
}
```

- `goals` contains active goals **with** a target date (`month`/`year` set); `undatedGoals` contains active goals **without** one (idea backlog, same fields); `completedGoals` contains closed goals.
- `transactionSpentCents` is the absolute sum of transactions linked to the goal via `savingGoalId`.
- `totals.rawAvailableCents` is the raw savings balance; `availableCents = max(rawAvailableCents − withdrawnForCompletedCents, 0)` is the pool for the remaining active goals. `totalTargetCents` and `suggestedMonthlyCents` consider only active **dated** goals — undated goals are excluded from the forward-looking plan. See `docs/calculations/07-sparziele.md`.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | No account found for user |

---

### `POST /api/saving-plan`

Create a new saving goal. Target date and amount are optional — a goal without `targetMonth`/`targetYear` is an **undated** goal (idea backlog).

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "title": "Urlaub 2027",
  "targetMonth": 6,
  "targetYear": 2027,
  "amountCents": 300000
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Required; must belong to user |
| `title` | string | Required; non-empty (trimmed) |
| `targetMonth` | integer | Optional; 1–12. Aliases accepted: `month`, `dueMonth`. Must be set/omitted **together with** `targetYear` |
| `targetYear` | integer | Optional; 1970–9999. Aliases accepted: `year`, `dueYear` |
| `amountCents` | integer | Optional; `>= 1` when present |

**Success response — `201 Created`:** The created `Budget` row (`id`, `accountId`, `categoryId: null`, `title`, `month`, `year`, `amountCents`, `completedAt: null`, `spentCents: null`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Account not found / not owned by user |

---

### `GET /api/saving-plan/[id]`

Get a single saving goal by ID.

**Auth required:** Yes

**Success response — `200 OK`:** Saving goal object (`id`, `accountId`, `categoryId`, `categoryName`, `title`, `month`, `year`, `amountCents`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `403` | Goal belongs to another user (`"Forbidden"`) |
| `404` | Goal does not exist |

---

### `PATCH /api/saving-plan/[id]`

Update a saving goal. Partial update with **null-clearing semantics**: omitting a field leaves it unchanged; sending `null` clears it (e.g., `targetMonth: null, targetYear: null` makes the goal undated; `amountCents: null` removes the target amount).

**Auth required:** Yes

**Request body (all fields optional):**
```json
{
  "title": "Urlaub Griechenland 2027",
  "targetMonth": 7,
  "targetYear": 2027,
  "amountCents": 350000
}
```

| Field | Type | Constraints |
|---|---|---|
| `title` | string | Optional; non-empty (trimmed) |
| `targetMonth` | integer or null | Optional; 1–12. Alias: `month`. Must be changed **together with** `targetYear` and share its null-ness |
| `targetYear` | integer or null | Optional; 1970–9999. Alias: `year` |
| `amountCents` | integer or null | Optional; `>= 1` or `null` to clear |

**Success response — `200 OK`:** Updated saving goal object (`id`, `accountId`, `categoryId`, `categoryName`, `title`, `month`, `year`, `amountCents`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `403` | Goal belongs to another user (`"Forbidden"`) |
| `404` | Goal does not exist |

---

### `DELETE /api/saving-plan/[id]`

Delete a saving goal. Linked transactions lose their `savingGoalId` (set to null) rather than being deleted.

**Auth required:** Yes

**Success response — `200 OK`:** `{ "success": true }`

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `403` | Goal belongs to another user (`"Forbidden"`) |
| `404` | Goal does not exist |

---

### `POST /api/saving-plan/[id]/complete`

Mark a saving goal as completed. Sets `completedAt = now` and stores the withdrawn amount as `spentCents`.

**Auth required:** Yes (only the owner of the goal's account may act)

**Request body:**
```json
{
  "spentCents": 115000
}
```

| Field | Type | Constraints |
|---|---|---|
| `spentCents` | integer | Required; `>= 0`. Amount actually withdrawn from the savings pool on completion |

**Success response — `200 OK`:**
```json
{
  "id": "bud_05",
  "completedAt": "2026-03-20T10:00:00.000Z",
  "spentCents": 115000
}
```

**Note:** Completing a goal does **not** create a transaction. `spentCents` is a snapshot reserved out of the computed savings pool that funds the remaining active goals; the raw savings balance and the real account balance are unchanged. See `docs/calculations/07-sparziele.md`.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (`spentCents` missing or negative) |
| `401` | Not authenticated |
| `403` | Goal not owned by the authenticated user |
| `404` | Goal not found |

---

### `DELETE /api/saving-plan/[id]/complete`

Reopen a completed saving goal. Resets `completedAt = null` and `spentCents = null`, returning the goal to the active plan.

**Auth required:** Yes (only the owner of the goal's account may act)

**Success response — `200 OK`:**
```json
{
  "id": "bud_05",
  "completedAt": null,
  "spentCents": null
}
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `403` | Goal not owned by the authenticated user |
| `404` | Goal not found |

---

### `POST /api/saving-plan/withdraw`

Withdraw money from the savings pool back into everyday spending. Creates a **positive** transaction in the savings category (money returns from the pool to the account); analytics treat it as a reduction of net savings, not as income.

**Auth required:** Yes

**Request body:**
```json
{
  "amountCents": 25000,
  "description": "Urlaubskasse"
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Optional — defaults to the user's first account |
| `amountCents` | integer | Required; positive; must not exceed the available savings balance |
| `description` | string | Optional (trimmed, max 200); defaults to `"Savings withdrawal"` |

**Success response — `201 Created`:** The created transaction object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Account not found / not owned by user |
| `409` | No savings category exists, nothing available to withdraw, or amount exceeds the available balance (response includes `availableCents`) |

---

## Analytics

### `GET /api/analytics/summary`

Current-month financial summary for the dashboard — backward-looking actuals plus forward-looking projections from recurring transactions. **No query parameters** — the route always evaluates the current calendar month and the user's **first account** (multi-account scoping is a known future extension).

**Auth required:** Yes

> **Units:** all monetary fields are **euros** (already divided by 100) — except `recurringTransactions[].amountCents`, which stays in cents.

**Success response — `200 OK`:**
```json
{
  "totalBalance": 12500.5,
  "carryoverFromLastMonth": 1200,
  "incomeTotal": 3200,
  "outcomeTotal": 941.4,
  "outcomeTotalExclSavings": 941.4,
  "monthlySavingsActual": 500,
  "remaining": 1758.6,
  "plannedSavings": 500,
  "completedGoals": [],
  "completedGoalsSpent": 0,
  "projectedIncomeTotal": 3200,
  "projectedOutcomeTotal": 1791.4,
  "projectedRemaining": 908.6,
  "outgoingByCategory": { "Lebensmittel": 63.4, "Miete": 850 },
  "categoryBudgets": [
    { "categoryId": "cat_02", "name": "Lebensmittel", "budget": 200, "spent": 63.4, "diff": -136.6 }
  ],
  "recurringTransactions": [
    { "id": "rec_01", "description": "Miete", "amountCents": -85000, "categoryId": "cat_03", "dayOfMonth": 1 }
  ],
  "recurringIncomeTotal": 0,
  "recurringOutcomeTotal": 850,
  "recurringPlannedSavings": 500,
  "projectedSavingsTotal": 500,
  "daily": {
    "labels": ["1", "2", "3"],
    "income": [0, 0, 3200],
    "outcome": [0, 850, 913.4],
    "savings": [1000, 1000, 1500]
  }
}
```

Notable semantics:

- `categoryBudgets[].diff` = `spent − budget` (positive = over budget).
- `recurringTransactions` contains only recurring items **not skipped** this month — skipped ones are filtered out server-side.
- `daily` series are **cumulative running totals** per day of month (including recurring projections and the savings baseline), ready for chart rendering.
- Savings classification happens **before** sign classification: transactions in the savings category count as savings (deposits negative, withdrawals positive → net savings), never as income/expenses.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | No account found for user |

---

### `GET /api/analytics/quarterly`

Rolling 3-month view (the two previous months plus the current one) of income, expenses, savings, and cumulative balance. **No query parameters**; uses the user's first account.

**Auth required:** Yes

**Success response — `200 OK`:**
```json
{
  "quarters": [
    { "month": 2, "year": 2026, "incomeCents": 320000, "outcomeCents": 88000, "savingsCents": 50000, "balanceCents": 182000 },
    { "month": 3, "year": 2026, "incomeCents": 320000, "outcomeCents": 91000, "savingsCents": 50000, "balanceCents": 361000 },
    { "month": 4, "year": 2026, "incomeCents": 320000, "outcomeCents": 94140, "savingsCents": 50000, "balanceCents": 536860 }
  ],
  "totals": { "incomeCents": 960000, "outcomeCents": 273140, "savingsCents": 150000 }
}
```

All values are **integer cents**. `balanceCents` is cumulative across the window. Income/outcome/savings use the same classification rules as the summary endpoint (savings category first, then sign).

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | No account found for user |

---

### `GET /api/analytics/monthly-review?month=…&year=…`

Deep review of a **completed** past month: KPIs, carryover, expense breakdown by category, income by source, top expenses, and completed saving goals. Uses the user's first account.

**Auth required:** Yes

**Query parameters (optional):**

| Parameter | Type | Description |
|---|---|---|
| `month` | integer | 1–12. Default: last completed month. Current/future months are clamped back to the last completed month |
| `year` | integer | Calendar year (same clamping rule) |

**Success response — `200 OK`:**
```json
{
  "month": 6,
  "year": 2026,
  "incomeCents": 320000,
  "outcomeCents": 94140,
  "savingsCents": 50000,
  "balanceAtStartCents": 120000,
  "balanceAtEndCents": 295860,
  "savingsRatePct": 16,
  "categories": [
    { "id": "cat_02", "name": "Lebensmittel", "spentCents": 6340, "budgetCents": 20000, "transactionCount": 3 }
  ],
  "incomeCategories": [
    { "id": "cat_01", "name": "Gehalt", "amountCents": 320000, "transactionCount": 1 }
  ],
  "topExpenses": [
    { "description": "Miete Juni", "amountCents": 85000, "categoryName": "Miete", "occurredAt": "2026-06-01T00:00:00.000Z" }
  ],
  "completedGoals": [
    { "title": "Laptop", "amountCents": 120000, "spentCents": 115000 }
  ],
  "completedGoalsSpentCents": 115000,
  "prevMonth": { "month": 5, "year": 2026, "incomeCents": 320000, "outcomeCents": 90000, "savingsCents": 50000 },
  "availableMonths": [ { "month": 6, "year": 2026 }, { "month": 5, "year": 2026 } ]
}
```

Notable semantics:

- All monetary values are **integer cents**.
- Income/expense classification is by **amount sign** (`amountCents >= 0` = income), not by `Category.isIncome` — except the savings category, which is classified first.
- `categories` (expenses) is sorted over-budget first, then by spend descending; an `"uncategorized"` entry is appended when uncategorized spend exists. `incomeCategories` is sorted by amount descending.
- `topExpenses` are the 5 largest single non-savings expenses (amounts reported positive).
- `availableMonths` lists every month from the earliest transaction up to (excluding) the current month, most recent first.
- `prevMonth` is `null` when the preceding month has no data.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | No account found for user |

---

## Household

The household is the tenancy boundary (Teil D). Every user belongs to exactly one household with a role of `OWNER` or `MEMBER`. All domain data is scoped by `householdId`; owner-only actions additionally check the role and return `403` otherwise.

### `GET /api/household`

Returns the caller's household and its member list.

**Success — `200 OK`:**
```json
{
  "id": "hh_…",
  "name": "Familie Thiemann",
  "role": "OWNER",
  "members": [
    { "userId": "u_…", "name": "Konrad", "email": "…", "role": "OWNER", "joinedAt": "…", "isMe": true }
  ]
}
```

| Status | Reason |
|---|---|
| `404` | Household not found |

### `PATCH /api/household`

Rename the household. **Owner only.** Body: `{ "name": string }` (1–80 chars). Returns `{ id, name }`. `403` if not OWNER, `400` on validation error.

### `GET /api/household/invites`

Lists open (unaccepted, unexpired) invites for the household — without tokens.

### `POST /api/household/invites`

Creates an invite. **Owner only.** Body: `{ email?: string, role?: "MEMBER" | "OWNER" }`. Returns the invite plus the **plaintext `token`** and a join `url` **once** (only the SHA-256 hash is stored, mirroring password reset). Invites are single-use and expire.

**Success — `201 Created`:** `{ id, email, role, expiresAt, createdAt, token, url }`

### `DELETE /api/household/invites/[id]`

Revokes an open invite. **Owner only.** Idempotent — already accepted/deleted invites return `404`.

### `POST /api/household/invites/accept`

The logged-in user accepts an invite and switches into the inviting household. Rate-limited per IP; lookup by token hash only.

**Body:** `{ "token": string }`

**Success — `200 OK`:** `{ "ok": true, "householdId": "hh_…" }`

| Status | Reason |
|---|---|
| `400` | Invalid or expired invite |
| `409` `HAS_OWN_DATA` | v1 only lets an *empty* account join (no household merge); the caller already has transactions/budgets/recurring |
| `409` | Already a member of this household |

The caller's previous (empty) household is orphaned and cascade-deleted on join.

### `POST /api/household/leave`

A `MEMBER` leaves the shared household and is immediately re-provisioned a fresh own household (as OWNER) with a default account + categories. An `OWNER` cannot leave (`403`).

### `DELETE /api/household/members/[userId]`

The `OWNER` removes a member. **Owner only.** The removed member is re-provisioned a fresh own household so they are never locked out. The owner cannot remove themselves (`400`); unknown/foreign members return `404`.

---

## Push & Notifications

Web Push (Teil C) — VAPID-based. Budget alerts, monthly-review reminders, and capture reminders.

### `POST /api/push/subscription`

Registers this device for Web Push. Idempotent over the unique `endpoint`: re-registering updates keys + `lastSeenAt`, and reassigns the endpoint to the current user on a shared device.

**Body:** `{ endpoint: string, keys: { p256dh: string, auth: string }, userAgent?: string }`

**Success — `201 Created`:** `{ "ok": true }`

### `DELETE /api/push/subscription`

Removes this device's registration. Body: `{ "endpoint": string }`. Only the caller's own subscriptions are deletable.

### `GET /api/notifications/settings`

Returns the caller's notification opt-outs and capture-reminder config.

```json
{
  "notifyBudgetAlerts": true,
  "notifyMonthlyReview": true,
  "reminder": { "enabled": false, "time": "20:00", "weekdays": 127, "timezone": "Europe/Berlin", "smartSuppress": true }
}
```

`weekdays` is a 7-bit bitmask (127 = every day). `smartSuppress` skips the reminder when the user already captured that day.

### `PUT /api/notifications/settings`

Partially updates settings. Body (all optional): `{ notifyBudgetAlerts?, notifyMonthlyReview?, reminder?: { enabled?, time?, weekdays?, timezone?, smartSuppress? } }`. The reminder record is upserted lazily. Returns `{ "ok": true }`.

---

## Sync

Two-way offline sync (Phase 3b). Write-path v1 covers **transactions** only (the sole offline-captured entity); reads of all entities come via pull. Authorization is scoped by `account.householdId`.

### `POST /api/sync/push`

Applies a FIFO batch of local transaction mutations.

**Body:** `{ "ops": PushOp[] }` (1–100 ops), where each op is:
```json
{
  "mutationId": "cuid",
  "entity": "transaction",
  "op": "create" | "update" | "delete",
  "id": "cuid",
  "patch": { "…": "…" },
  "baseUpdatedAt": 1723545600000
}
```
- `patch` (create/update): whitelisted fields `accountId, categoryId, savingGoalId, amountCents, description, occurredAt, taxRelevant`. Create requires `accountId, amountCents, description, occurredAt`.
- `baseUpdatedAt`: the `updatedAt` (epoch ms) the client based its edit on — drives concurrent-change detection.

**Success — `200 OK`:** `{ "results": PushResult[] }`, one per op:

| `status` | Meaning |
|---|---|
| `applied` | Written; `row` = server state after write |
| `duplicate` | Known `mutationId` replay or already-existing record |
| `conflict` | Concurrent change (per-field LWW won; `row` + `conflicts[]`), **or** the server row is tombstoned (delete wins; discarded) |

Conflict rules (see `@doewe/shared/sync`): field-merge + Last-Write-Wins per field, losing values journaled to `ConflictLog`; **delete wins** over a concurrent edit; per-op idempotency via `MutationLog`.

### `GET /api/sync/pull`

Returns a full household snapshot for offline reads: `{ accounts, categories, transactions, budgets, recurring }` (tombstones excluded). Supports `ETag` / `If-None-Match` → `304 Not Modified` when unchanged.

### `GET /api/sync/conflicts`

Returns the recent `ConflictLog` for the household (last 7 days, newest first, up to 50) so the UI can surface a "changed on another device" notice. Response is an array of `{ id, entity, entityId, field, serverValue, clientValue, createdAt }`.

---

## Demo

### `POST /api/demo/seed`

Public (deliberately **unauthenticated**) endpoint used by the login page's demo mode. Ensures the shared demo user (`demo@doewe.test`) exists with 36 months of example data. Idempotent — a versioned check skips the reseed when the data is current. The operation is hard-wired to the demo account and accepts no request body.

**Auth required:** No

**Success response — `200 OK`:** `{ "ok": true, "refreshed": false }` (`refreshed: true` when data was (re)seeded)

**Error responses:**

| Status | Reason |
|---|---|
| `500` | Demo seed failed |
