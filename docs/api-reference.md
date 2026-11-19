# Doewe — API Reference

All routes are HTTP JSON APIs served under `/api`. Every route requires an active session unless noted otherwise. Each route handler enforces authentication itself: it calls `getSessionUser()` (from `apps/web/lib/auth.ts`) and returns `401 { "error": "Unauthorized" }` when there is no session.

**Base URL:** `https://<your-domain>/api`

**Auth mechanism:** Session cookie set by NextAuth on successful login. Include credentials in fetch calls (`credentials: "include"` or `same-origin`).

**Money units:** CRUD endpoints (transactions, budgets, saving plan, …) accept and return **integer euro cents** (`amountCents`). Exception: `GET /api/analytics/summary` divides by 100 at the output step and returns **euro** values; the other analytics endpoints (`quarterly`, `monthly-review`, `category-year`), the recurring year matrix and `GET /api/tax` return cents (fields suffixed `…Cents`).

**Calculation rules:** every endpoint that totals or buckets transactions follows the same rules, stated in [`docs/calculations/00-grundregeln.md`](./calculations/00-grundregeln.md):

- **Calendar:** the day, month and year of a booking, "today" and "current month" are calendar values in **Europe/Berlin**, independent of the server's time zone. Ranges are half-open. A bare calendar day sent by a client (`yyyy-mm-dd`) is stored as 12:00 Berlin time of that day.
- **Classification:** a booking in a savings category (any category of the household named `savings` or `sparen`, trimmed, case-insensitive — there may be several) is *savings* whatever its sign (deposit negative, withdrawal positive). Everything else is *income* if `amountCents >= 0` and *outcome* if `< 0`. `Category.isIncome` decides nothing. Savings figures are net (deposits minus withdrawals) and can be negative.
- **Scope:** the tenant is the household. Analytics cover **all accounts** of the household; soft-deleted bookings count nowhere.
- **Booked vs. planned:** only `GET /api/analytics/summary` includes planned recurring occurrences, and only in its `recurring…`/`projected…` fields. An occurrence of a recurring transaction is identified by `(recurringTransactionId, recurringPeriod)`, not by the month of `occurredAt`.

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

List all accounts of the authenticated user's household, **oldest first** (`createdAt asc`). The order is part of the contract: forms preselect `accounts[0]`, and every server-side default that needs "the" account (e.g. `POST /api/saving-plan/withdraw` without `accountId`) takes the oldest one, so both hit the same account.

**Auth required:** Yes

**Request body:** None

**Success response — `200 OK`:**
```json
[
  { "id": "acc_01", "name": "Girokonto", "userId": "usr_01", "householdId": "hh_01", "createdAt": "2026-01-01T00:00:00.000Z" }
]
```

`userId` is the original creator (provenance only); authorization is scoped by `householdId`.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/accounts`

Create a new account in the authenticated user's household.

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

List **all** transactions of the household across all its accounts, ordered by `occurredAt` descending. Soft-deleted transactions are not returned. There are no query parameters — filtering and totals happen client-side, by the rules in `packages/shared/src/transactionFilter.ts` (`filterTransactions`, `listTotals`): the type filter uses the same classification and the date range the same Europe/Berlin calendar days as the analytics endpoints, so the list filtered to a month reproduces that month's review figures.

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
    "occurredAt": "2026-04-01T10:00:00.000Z",
    "taxRelevant": false,
    "createdByUserId": "usr_01",
    "receiptMerchant": null,
    "recurringTransactionId": null,
    "recurringPeriod": null,
    "createdAt": "2026-04-01T08:00:00.000Z",
    "updatedAt": "2026-04-01T08:00:00.000Z",
    "deletedAt": null
  }
]
```

`recurringTransactionId` is set on bookings that belong to a recurring transaction (auto-booked, or linked via `make-recurring`); `recurringPeriod` (`"YYYY-MM"`) is the month the occurrence was booked **for** and stays the same when `occurredAt` is edited.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/transactions`

Create a new transaction.

**Auth required:** Yes

**Request headers (optional):** `Idempotency-Key: <mutationId>` — set by the offline outbox. The response is stored together with the booking; a replay with the same key (by the same user) returns the stored response instead of booking twice.

**Request body:**
```json
{
  "accountId": "acc_01",
  "categoryId": "cat_02",
  "amountCents": -6340,
  "description": "Rewe",
  "occurredAt": "2026-04-05"
}
```

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Optional; client-generated cuid2 (offline capture), so the optimistic row and the server row share one ID |
| `accountId` | string | Required; must belong to the household |
| `categoryId` | string | Optional; must belong to the household. **Omit** the field entirely — an explicit `null` fails validation |
| `savingGoalId` | string | Optional; ID of a `Budget` row of the household. Omit rather than sending `null` |
| `amountCents` | integer | Required; within the Postgres `int4` range (−2,147,483,648 … 2,147,483,647). Negative = money leaves the account, positive = money comes in; `0` is accepted |
| `description` | string | Required; trimmed, non-empty after trimming; no NUL characters or unpaired surrogates |
| `occurredAt` | string | Required. Either an ISO instant with a time zone (`…Z` or `…+01:00`, stored as given), an ISO date-time without a zone (read as Europe/Berlin wall-clock time), or a bare calendar day `yyyy-mm-dd`, which is stored as **12:00 Europe/Berlin** of that day. Anything else, a date that does not exist, or a year before 1900 or after 9999 is a `400` |
| `taxRelevant` | boolean | Optional. Earmarks the transaction for the tax return (see [Attachments](#attachments-receipts)). When omitted, defaults to the category's `isTaxRelevant` (else `false`); an explicit value always wins |

**Success response — `201 Created`:** Full transaction object (same shape as GET list item).

After the booking is committed, the route checks the budget alert of the booking's category (push notification; see [Budgets](#budgets)).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (Zod `flatten()` object) — also for a body that is not JSON, a description of only whitespace, an amount outside `int4` and an unreadable date. These are deliberately `400`, never `500`: the offline outbox halts on any 5xx and would block every later offline booking |
| `401` | Not authenticated |
| `404` | Account, category, or saving goal not found / not in the household |
| `409` | `{ "error": "Duplicate transaction id" }` — the client `id` already exists |

---

### `PATCH /api/transactions/[id]`

Update an existing transaction. **Not a partial update** — the request is validated against the same schema as `POST`, so `accountId`, `amountCents`, `description`, and `occurredAt` are required and `occurredAt` is read the same way (a bare `yyyy-mm-dd` means 12:00 Europe/Berlin of that day). The route writes account, category (omitted = cleared), amount, description, date and `taxRelevant`; when `taxRelevant` is omitted, the stored value is kept (the flag is never silently cleared). `savingGoalId` and `id` in the body are ignored — the goal link is not changed by `PATCH`. `recurringTransactionId` and `recurringPeriod` are never changed: moving an auto-booked occurrence into another month does not make its original month count as unbooked.

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "categoryId": "cat_02",
  "amountCents": -7000,
  "description": "Rewe updated",
  "occurredAt": "2026-04-06"
}
```

**Success response — `200 OK`:** Updated transaction object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (same rules as `POST`, including a non-JSON body and an unreadable date) |
| `401` | Not authenticated |
| `404` | Transaction, account or category not found / not in the household |

---

### `DELETE /api/transactions/[id]`

Delete a transaction by ID. This is a **soft delete**: the row gets `deletedAt` (a tombstone that propagates through sync) and its attachments are removed in the same database transaction. Deleted transactions count in no list or analytics figure. A deleted booking of a recurring transaction still occupies its period — that month is not booked again and not shown as planned again.

**Auth required:** Yes

**Request body:** None

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Transaction not found or not in the household |

---

### `POST /api/transactions/batch`

Create grouped transactions from a receipt scan. Each group becomes one transaction with its line items (`ReceiptLineItem`) attached; all are created in one database transaction.

The booked amount is the **negated sum** of the group's line totals, with its sign: a positive group total is an expense (negative `amountCents`); a negative one — a discount, coupon or deposit refund that ended up alone in its category — is booked as a positive row. The rows of one receipt therefore always add up to minus the receipt total. Groups that net to zero are skipped.

**Auth required:** Yes

**Request body:**
```json
{
  "receiptDate": "2026-04-05",
  "receiptMerchant": "Rewe",
  "accountId": "acc_01",
  "groups": [
    {
      "categoryId": "cat_02",
      "items": [
        { "name": "Milch", "quantity": 2, "unitPriceCents": 129, "totalCents": 258, "position": 0 }
      ]
    }
  ]
}
```

| Field | Type | Constraints |
|---|---|---|
| `receiptDate` | string | Required; calendar day `yyyy-mm-dd` (must be a real day). Stored as 12:00 Europe/Berlin of that day |
| `receiptMerchant` | string | Optional; stored on each transaction |
| `accountId` | string | Required; must belong to the household |
| `taxRelevant` | boolean | Optional. When omitted, each transaction inherits `isTaxRelevant` of its category (like `POST /api/transactions`) |
| `groups` | array | Required; at least one group |
| `groups[].categoryId` | string | Required; must belong to the household |
| `groups[].items` | array | Required; at least one item |
| `items[].name` | string | Required; non-empty |
| `items[].quantity` | number | Optional; positive, defaults to `1` |
| `items[].unitPriceCents`, `items[].totalCents` | integer | Required; within `int4`. `totalCents` may be negative (discount, coupon, deposit refund). The sum of a group's `totalCents` must also fit `int4` |
| `items[].position` | integer | Required; `>= 0` |

The description of each transaction is the group's item names joined with `", "`.

**Success response — `201 Created`:**
```json
{
  "transactions": [
    { "id": "txn_21", "categoryId": "cat_02", "amountCents": -258, "description": "Milch", "lineItemCount": 1 }
  ]
}
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed — `error` is a **plain string** naming the field (e.g. `"receiptDate: Expected a calendar day (yyyy-mm-dd)"`), not a Zod `flatten()` object. Also when every group nets to zero (`"groups: Nothing to book, every group nets to zero"`) |
| `401` | Not authenticated |
| `404` | Account not found, or one or more categories not found / not in the household |

---

## Attachments (Receipts)

Receipt files (photos/PDFs) attached to transactions as evidence for the German tax return (Belegvorhaltepflicht — receipts are archived, not submitted). Files are stored as bytes in PostgreSQL. Limits: allowed types `image/jpeg`, `image/png`, `image/webp`, `application/pdf`; max. **5 MB** per file; max. **5 attachments** per transaction. List/metadata responses never contain the file bytes.

### `POST /api/transactions/[id]/make-recurring`

Turns an existing booking into a recurring transaction (`MONTHLY`). Creates a `RecurringTransaction` with the booking's account, category, amount (sign as stored) and description, and links the booking to it (`recurringTransactionId`).

**Auth required:** Yes (booking must belong to the user's household)

**Request body:**

| Field | Type | Description |
|---|---|---|
| `intervalMonths` | integer | Required. 1–24 |
| `dayOfMonth` | integer | Optional. 1–31; defaults to the booking's calendar day (Europe/Berlin) |

The anchor `nextOccurrence` = booking day (calendar day in Europe/Berlin) + `intervalMonths` (day = `dayOfMonth`, clamped to the target month's length, e.g. 31 Jan + 1 month → 28/29 Feb), stored as 12:00 Europe/Berlin of that day. The origin month is therefore not booked again by the auto-booking run. The booking itself becomes the occurrence of its own Berlin month: it gets `recurringPeriod` = that month, so moving it into the next month later does not hide that month's own occurrence. Create and link happen in one database transaction.

**Success response — `201 Created`:** the new recurring transaction object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | `{ "error": "Transaction not found" }` — unknown, soft-deleted or foreign booking |
| `409` | `{ "error": "Transaction is already linked to a recurring transaction" }` (also on a concurrent double submit) |

---

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

All tax-earmarked transactions (`taxRelevant: true`) of one calendar year, with category info, attachment metadata, and per-category sums. Backs the `/tax` page. The year is the calendar year of `occurredAt` **in Europe/Berlin**: a booking entered at 00:30 on 1 January (still 31 December in UTC) belongs to the new tax year. Household-scoped; soft-deleted transactions are excluded.

**Auth required:** Yes

**Query parameters:**

| Parameter | Type | Constraints |
|---|---|---|
| `year` | integer | Optional, defaults to the current year in Europe/Berlin. Must be 2000–2100, otherwise `400` |

**Success response — `200 OK`:**
```json
{
  "year": 2026,
  "transactions": [
    {
      "id": "txn_07",
      "amountCents": -18900,
      "description": "Fachbuch",
      "occurredAt": "2026-03-12T11:00:00.000Z",
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

Renders the same tax-earmarked transaction set as `GET /api/tax` (same Europe/Berlin calendar year) into a single PDF; each booking is printed with its calendar day in Europe/Berlin. Contents: a cover page (household, generation date, position/receipt counts, separate income/expense totals plus the grand total), a category-grouped transaction table (running number, date, description, amount, receipt reference), and — when `includeReceipts=1` — a receipt appendix with one page per attachment.

**Auth required:** Yes. Rate-limited to 5 exports per user per 10 minutes.

**Query parameters:**

| Parameter | Type | Constraints |
|---|---|---|
| `year` | integer | Optional, defaults to the current year in Europe/Berlin (resolved per request). Must be 2000–2100, otherwise `400` |
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

A recurring transaction is a template. Its due occurrences are **booked automatically** as real transactions: daily by the cron endpoint (`POST /api/cron/materialize-recurring`) and, for completed months, whenever an analytics endpoint is read. Details and known limitations: `docs/calculations/03-wiederkehrende-transaktionen.md`.

- **Anchor:** `nextOccurrence` is the anchor of the series, **not** "the next" occurrence, and is not advanced after a booking. Scheduling reads only its month (in Europe/Berlin): the template is due in the anchor month and every `intervalMonths` months after it. The day of the booking is `dayOfMonth`, clamped to the length of the month. The anchor is always stored as 12:00 Europe/Berlin of the intended calendar day.
- **Occurrence identity:** an occurrence is `(recurringTransactionId, recurringPeriod)`, where `recurringPeriod` (`"YYYY-MM"`) is the month it was booked for. A month counts as booked as soon as such a booking exists — also when it was later moved into another month or deleted.
- **Known limitations:** a payment entered by hand is not recognised as an occurrence (it has no `recurringTransactionId`), so a hand-entered payment plus a template books it twice; an anchor in the past back-books every due month since then; back-booked months use the template's current amount.

### `GET /api/recurring-transactions`

List all recurring transactions of the household, ordered by `nextOccurrence` ascending. Soft-deleted templates are not returned. Skip records are **not** included — fetch them via `GET /api/recurring-transactions/skips`.

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
    "nextOccurrence": "2026-05-01T10:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

Templates created before the anchor rule may carry an anchor at midnight (UTC or Berlin) instead of noon; all three fall on the same Berlin calendar day, so no migration was needed.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/recurring-transactions`

Create a new recurring transaction template. `frequency` is set server-side to `"MONTHLY"`; the actual cadence is controlled by `intervalMonths`.

How the anchor `nextOccurrence` is set:

- **Without `startDate`:** from `dayOfMonth` and today's calendar day in Europe/Berlin. The series starts this month only if the day (clamped to the month's length) is still ahead, i.e. **strictly after today**; if it is today or already past, it starts next month. A due day that is today counts as passed so that someone who entered today's payment by hand and then creates the template does not get it booked a second time. Example on 30 November: `dayOfMonth` 30 and 31 both clamp to today and both start in December.
- **With `startDate`** (`yyyy-mm-dd`): the anchor is that date — e.g. a subscription whose first charge is a few months out. `dayOfMonth` defaults to the day of `startDate`; if a different `dayOfMonth` is sent as well, the series starts in the month of `startDate` and books on `dayOfMonth`. A `startDate` in the past back-books every due month since then on the next run.

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
| `accountId` | string | Required; must belong to the household |
| `categoryId` | string | Optional; must belong to the household |
| `amountCents` | integer | Required; sign as for transactions |
| `description` | string | Required; non-empty |
| `intervalMonths` | integer | Optional; 1–24, defaults to `1` (e.g., `3` = quarterly) |
| `dayOfMonth` | integer | Optional; 1–31. Defaults to the day of `startDate` if given, else `1` |
| `startDate` | string | Optional; `yyyy-mm-dd`, must be a real calendar day. When set, becomes the anchor; otherwise the anchor is derived from `dayOfMonth` (see above) |

**Success response — `201 Created`:** Full recurring transaction object (with computed `nextOccurrence` and `frequency: "MONTHLY"`).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Account or category not found / not in the household |

---

### `PATCH /api/recurring-transactions/[id]`

Update a recurring transaction template. Partial update — send only changed fields. Accepts the same fields as the create endpoint. The anchor `nextOccurrence` is only touched when `startDate` or `dayOfMonth` is in the body:

- `startDate` (`yyyy-mm-dd`, takes precedence) re-anchors the series to that date.
- `dayOfMonth` alone only moves the day: the anchor **month is kept** and the day is clamped to the length of that month. The series is not re-anchored — with an interval above 1 the due months stay the same, and no earlier month drops out of the yearly view or the CSV.

Occurrences that are already booked are left untouched in both cases. `categoryId: null` removes the category; omitting the field leaves it unchanged.

**Auth required:** Yes

**Success response — `200 OK`:** Updated recurring transaction object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Template, account or category not found / not in the household |

---

### `DELETE /api/recurring-transactions/[id]`

Delete a recurring transaction template. This is a **soft delete** (`deletedAt`): the template no longer books or plans anything; transactions it already booked stay, and its skip records are not removed.

**Auth required:** Yes

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Not found or not in the household |

---

### `GET /api/recurring-transactions/yearly?year=YYYY`

Year matrix of the household's recurring transactions: per item the signed amount (integer cents) due in each month of the year, grouped into income, expenses and savings. This is the **plan** derived from the templates, not what was actually booked. An item appears in a month only if it is due there (anchor month in Europe/Berlin + `intervalMonths`, same logic as `isRecurringDueInMonth`); months skipped via `RecurringTransactionSkip` of that year count as `0`. Soft-deleted items are excluded. Items whose anchor lies after the year stay as rows of zeros. Classification as everywhere: savings category first (any category of the household named `savings`/`sparen`, trimmed, case-insensitive), otherwise the sign decides (`>= 0` income, `< 0` expense).

**Auth required:** Yes

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `year` | integer 2000-2100 | Optional; defaults to the current year in Europe/Berlin |

**Success response — `200 OK`:** `RecurringYearMatrix` (`@doewe/shared`)

```json
{
  "year": 2026,
  "income": {
    "rows": [
      { "id": "rec_01", "description": "Gehalt", "categoryId": "cat_01", "categoryName": "Gehalt", "kind": "income",
        "amountCents": 300000, "intervalMonths": 1, "monthlyCents": [300000, 300000, "… 12 entries"], "totalCents": 3600000 }
    ],
    "monthlyTotalsCents": [300000, "… 12 entries"],
    "totalCents": 3600000,
    "monthlyAverageCents": 300000
  },
  "expenses": { "rows": [], "monthlyTotalsCents": [], "totalCents": 0, "monthlyAverageCents": 0 },
  "savings": { "rows": [], "monthlyTotalsCents": [], "totalCents": 0, "monthlyAverageCents": 0 },
  "net": { "monthlyTotalsCents": [300000, "… 12 entries"], "totalCents": 3600000, "monthlyAverageCents": 300000 }
}
```

`net` is the signed sum of all three groups; `monthlyAverageCents` is `round(totalCents / 12)`. Rows are ordered by description.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | `{ "error": "Invalid query" }` — `year` not an integer in 2000-2100 |
| `401` | Not authenticated |

---

### `GET /api/recurring-transactions/export?year=YYYY`

CSV download of the household's recurring **expenses and savings** for one year: one row per template with the amount due in each month (same due logic, skips and anchor month as the yearly matrix) and a year total. The rows come from the same loader as the yearly matrix, so both classify identically — savings category first, then the sign; `Category.isIncome` decides nothing. Income templates are left out.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `year` | integer 2000-2100 | Optional; defaults to the current year in Europe/Berlin |

**Success response — `200 OK`:** `text/csv; charset=utf-8` with a UTF-8 BOM, `Content-Disposition: attachment; filename="wiederkehrend-<year>.csv"`, `Cache-Control: private, no-store`.

Format: separator `;`, decimal comma, CRLF line breaks. Columns: `Beschreibung`, `Kategorie`, `Typ` (`Ausgabe` or `Sparen`), `Jan` … `Dez`, `Summe`. Expense rows come first, then savings rows, then the sum rows `Summe Ausgaben`, `Summe Sparen` and `Gesamt`. Amounts are positive when money leaves the account; a recurring withdrawal from savings (stored positive in a savings category) is therefore negative and reduces `Summe Sparen`. Text cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` (spreadsheet formula injection).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | `{ "error": "Invalid query" }` — `year` not an integer in 2000-2100 |
| `401` | Not authenticated |

---

### `POST /api/cron/materialize-recurring`

Books every due, not yet booked and not skipped occurrence of every recurring transaction as a real transaction — including months missed in the past (one code path for the daily run and for back-booking). Called daily by a Railway cron. The public demo account is excluded.

An occurrence is due once the calendar day of the run **in Europe/Berlin** has reached its due day (`dayOfMonth`, clamped to the length of the month). The booking is dated 12:00 Europe/Berlin of the due day, carries `recurringTransactionId` and `recurringPeriod`, copies account, category, amount and description from the template (the template's **current** amount, also for past months) and inherits the tax flag of its category. A month counts as booked as soon as a booking of the template for that period exists — also a moved or deleted one — so a second run on the same day books nothing twice.

**Auth required:** No session. `Authorization: Bearer <CRON_SECRET>`; without a configured `CRON_SECRET` the endpoint always answers `401`.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `dryRun` | `"true"` | Optional. Writes nothing and only lists what would be booked. Check it against the existing bookings before the first real run on real data: payments already entered by hand are not recognised and would be booked a second time |

**Success response — `200 OK`:**
```json
{
  "ok": true,
  "dryRun": false,
  "booked": 1,
  "occurrences": [
    { "recurringId": "rec_01", "accountId": "acc_01", "transactionId": "txn_31", "year": 2026, "month": 5, "amountCents": -85000, "description": "Miete" }
  ]
}
```

`transactionId` is `null` for a dry run. A single occurrence that fails to book is logged and skipped; the run continues.

The analytics endpoints (`summary`, `quarterly`, `monthly-review`, `category-year`) run the same booking for the caller's household, limited to **completed** months, before they calculate — so a cron outage cannot silently distort review and carryover. The current month is left to the cron and shows up as "planned" on the dashboard until then.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Missing or wrong bearer token |

---

## Recurring Transaction Skips

### `GET /api/recurring-transactions/skips?year=…&month=…`

List the skips of **one calendar month** across all recurring transactions of the household. A skipped month is not booked automatically, is neither due nor planned on the dashboard, and counts as `0` in the yearly matrix and the CSV. A skip only prevents a booking — it does not remove an occurrence that is already booked.

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
| `recurringId` | string | Must belong to the household (via account) |
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
| `404` | Recurring transaction not found or not in the household |

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
| `404` | Recurring transaction not found or not in the household |

---

## Budgets

`/api/budgets` manages **legacy per-month** category budgets (`Budget` rows with a category). The app's `/budgets` page works with [Budget Plans](#budget-plans) instead; a per-month budget only applies to categories without a plan. "Spent" per category is the same figure everywhere (dashboard, review, yearly table, budget alert): the bookings of the category classified as outcome in the Europe/Berlin month, across all accounts of the household — a refund does not reduce it.

**Known limitation — budget alerts:** the push budget alert (80 % / 100 %, checked after `POST /api/transactions`) reads only a per-month `Budget` row for the booking's category, month and year on the booking's account. **Budget plans never trigger an alert.** Its "spent" figure is the dashboard's: booked outcome of the category plus recurring occurrences still planned for the month.

### `GET /api/budgets`

List **all** budget rows of the household — including saving goals (`categoryId = null`) — ordered by `year desc, month desc`. There are no query parameters.

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
| `accountId` | string | Required; must belong to the household |
| `categoryId` | string | Optional (omitting it creates a saving-goal-like row); unique per (account, category, month, year). Rows without a category are not covered by the constraint — several per month are possible |
| `month` | integer | Required; 1–12 |
| `year` | integer | Required; 1970–9999 |
| `amountCents` | integer | Required (no positivity check — `0` and negative values are accepted) |

There is **no `title` field** in the schema — the DB default `""` is used.

**Success response — `201 Created`:** Full budget object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Account or category not found / not in the household |
| `500` | Duplicate (account, category, month, year) — the unique-constraint violation is not caught explicitly |

---

## Budget Plans

Standing per-category budgets (`MONTHLY` or `YEARLY`); the plan takes precedence over a per-month budget from `/api/budgets`, which only applies to categories without a plan (legacy rows are read for all accounts of the household and summed per category and month). All endpoints require auth (`401`) and are household-scoped. Calculation: `docs/calculations/06-budgets.md`.

Plans have no start date and apply to every month, also closed ones. The monthly shares of a `YEARLY` plan are derived on every read from the **current** recurring templates of that year, so they move — for closed months too — when a template is added, edited, deleted or skipped; the yearly sum stays the same.

### `GET /api/budget-plans?year=YYYY`

`year` is optional (default: current year in Europe/Berlin, 2000–2100, else `400 {"error":"Invalid query"}`).

**Success response — `200 OK`:**
```json
{
  "year": 2026,
  "availablePerMonthCents": [0, 200000, 200000, 200000, 200000, 200000, 200000, 200000, 200000, 200000, 200000, 200000],
  "plans": [
    {
      "id": "plan_01", "categoryId": "cat_02", "period": "YEARLY", "amountCents": 1200000,
      "createdAt": "2026-04-01T00:00:00.000Z", "updatedAt": "2026-04-01T00:00:00.000Z",
      "categoryName": "Hobby", "monthlyCents": [0, 109100, 109090, 109090, 109090, 109090, 109090, 109090, 109090, 109090, 109090, 109090]
    }
  ],
  "budgetableCategories": [{ "id": "cat_02", "name": "Hobby", "planId": "plan_01" }, { "id": "cat_03", "name": "Food", "planId": null }]
}
```

`availablePerMonthCents` is the smoothed monthly availability of the recurring-transaction year matrix (yearly income / 12, rounded, plus that month's recurring expenses and savings). `budgetableCategories` excludes income and savings categories. `monthlyCents` always sums to the yearly amount for `YEARLY` plans.

### `POST /api/budget-plans`

Body: `{ "categoryId": string, "period": "MONTHLY" | "YEARLY", "amountCents": integer 1..1000000000 }`

| Status | Reason |
|---|---|
| `201` | Plan DTO `{ id, categoryId, period, amountCents, createdAt, updatedAt }`; a soft-deleted plan of the category is revived (same `id`) |
| `400` | Validation failed, or `{"error":"Category not budgetable"}` (savings/income category) |
| `404` | `{"error":"Category not found"}` (unknown, foreign or soft-deleted category) |
| `409` | `{"error":"Budget plan already exists for category"}` |

### `PATCH /api/budget-plans/[id]`

Body: `{ "period"?: ..., "amountCents"?: ... }` (at least one field). `200` Plan DTO; `400` validation / empty body; `404` unknown, foreign or deleted plan.

### `DELETE /api/budget-plans/[id]`

Soft-delete. `204` no body; `404` unknown, foreign or already deleted plan.

---

## Saving Plan

### `GET /api/saving-plan`

List the saving goals of the household plus the computed plan totals. Saving goals are stored as `Budget` rows with `categoryId = null`; they are read across all accounts of the household. Rows with a category are category budgets and never appear here. The savings pool is one figure per household: all savings categories, all accounts.

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
    "rawAvailableCents": 85000,
    "withdrawnForCompletedCents": 0,
    "availableCents": 85000,
    "totalTargetCents": 300000,
    "suggestedMonthlyCents": 21500
  }
}
```

(Example read in August 2026 with no savings booked yet that month: `ceil((300000 − 85000) / 10 months) = 21500`.)

- `goals` contains active goals **with** a target date (`month`/`year` set); `undatedGoals` contains active goals **without** one (idea backlog, same fields); `completedGoals` contains closed goals.
- `transactionSpentCents` is the absolute sum of the **not deleted** transactions linked to the goal via `savingGoalId`.
- `totals.rawAvailableCents` is the raw savings balance: the negated sum of all bookings in all savings categories of the household (deposits are stored negative, withdrawals positive). `availableCents = max(rawAvailableCents − withdrawnForCompletedCents, 0)` is the pool for the remaining active goals; `withdrawnForCompletedCents` is the sum of `spentCents` of all completed goals.
- `totalTargetCents` and `suggestedMonthlyCents` consider only active **dated** goals — undated goals are excluded from the forward-looking plan.
- `suggestedMonthlyCents` is the amount to set aside in each remaining month, the current one included. It is measured against the pool **as it stood at the start of the current Europe/Berlin month** (`availableCents` minus this month's net deposits), so the rate does not drop as soon as the user saves. See `docs/calculations/07-sparziele.md`.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | The household has no account |

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
| `accountId` | string | Required; must belong to the household |
| `title` | string | Required; trimmed, non-empty after trimming |
| `targetMonth` | integer | Optional; 1–12. Aliases accepted: `month`, `dueMonth`. Must be set/omitted **together with** `targetYear` |
| `targetYear` | integer | Optional; 1970–9999. Aliases accepted: `year`, `dueYear` |
| `amountCents` | integer | Optional; `>= 1` and within `int4` when present |

**Success response — `201 Created`:** The created `Budget` row (`id`, `accountId`, `categoryId: null`, `title`, `month`, `year`, `amountCents`, `completedAt: null`, `spentCents: null`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (also a title of only whitespace or an amount beyond `int4`) |
| `401` | Not authenticated |
| `404` | Account not found / not in the household |

---

### `GET /api/saving-plan/[id]`

Get a single saving goal by ID. Only `Budget` rows without a category are goals; the ID of a category budget yields `404` (also for `PATCH`, `DELETE` and the `complete` routes).

**Auth required:** Yes

**Success response — `200 OK`:** Saving goal object (`id`, `accountId`, `categoryId`, `categoryName`, `title`, `month`, `year`, `amountCents`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `403` | Goal belongs to another household (`"Forbidden"`) |
| `404` | Goal does not exist, or the row is a category budget |

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
| `title` | string | Optional; trimmed, non-empty after trimming |
| `targetMonth` | integer or null | Optional; 1–12. Alias: `month`. Must be changed **together with** `targetYear` and share its null-ness |
| `targetYear` | integer or null | Optional; 1970–9999. Alias: `year` |
| `amountCents` | integer or null | Optional; `>= 1` and within `int4`, or `null` to clear |

**Success response — `200 OK`:** Updated saving goal object (`id`, `accountId`, `categoryId`, `categoryName`, `title`, `month`, `year`, `amountCents`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `403` | Goal belongs to another household (`"Forbidden"`) |
| `404` | Goal does not exist, or the row is a category budget |

---

### `DELETE /api/saving-plan/[id]`

Delete a saving goal. This is a **soft delete** (`deletedAt`); linked transactions are not deleted and keep their `savingGoalId`.

**Auth required:** Yes

**Success response — `200 OK`:** `{ "success": true }`

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `403` | Goal belongs to another household (`"Forbidden"`) |
| `404` | Goal does not exist, or the row is a category budget |

---

### `POST /api/saving-plan/[id]/complete`

Mark a saving goal as completed. Sets `completedAt` to the instant of the request and stores the withdrawn amount as `spentCents`.

**Auth required:** Yes (any member of the goal's household)

**Request body:**
```json
{
  "spentCents": 115000
}
```

| Field | Type | Constraints |
|---|---|---|
| `spentCents` | integer | Required; `>= 0`, within `int4`. Amount actually withdrawn from the savings pool on completion. Not capped by the pool |

**Success response — `200 OK`:**
```json
{
  "id": "bud_05",
  "completedAt": "2026-03-20T10:00:00.000Z",
  "spentCents": 115000
}
```

**Known limitation:** Completing a goal does **not** create a transaction. `spentCents` is a snapshot reserved out of the computed savings pool that funds the remaining active goals; the raw savings balance and the real account balance are unchanged. Consequences: once a goal was completed, `availableCents` can no longer be derived from the savings bookings alone; withdrawing the money via `POST /api/saving-plan/withdraw` **and** completing the goal with the same amount subtracts it twice; reopening a goal releases its reservation. See `docs/calculations/07-sparziele.md`.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (`spentCents` missing, negative or beyond `int4`) |
| `401` | Not authenticated |
| `403` | Goal belongs to another household |
| `404` | Goal not found, or the row is a category budget |

---

### `DELETE /api/saving-plan/[id]/complete`

Reopen a completed saving goal. Resets `completedAt = null` and `spentCents = null`, returning the goal to the active plan and releasing its reservation in the savings pool.

**Auth required:** Yes (any member of the goal's household)

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
| `403` | Goal belongs to another household |
| `404` | Goal not found, or the row is a category budget |

---

### `POST /api/saving-plan/withdraw`

Withdraw money from the savings pool back into everyday spending. Creates a **positive** transaction in a savings category of the household (money returns from the pool to the account), dated at the instant of the request; analytics treat it as a reduction of net savings, not as income. If the household has several savings categories, the booking goes to the oldest one. The cap is the household's pool — all savings categories, all accounts, minus what completed goals reserved (`totals.availableCents` of `GET /api/saving-plan`).

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
| `accountId` | string | Optional — defaults to the household's oldest account (the first entry of `GET /api/accounts`) |
| `amountCents` | integer | Required; positive; must not exceed the available savings pool |
| `description` | string | Optional (trimmed, max 200); defaults to `"Savings withdrawal"` |

**Success response — `201 Created`:**
```json
{ "id": "txn_42", "amountCents": 25000, "availableCents": 60000 }
```

`availableCents` is the pool left after the withdrawal.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (also a body that is not JSON) |
| `401` | Not authenticated |
| `404` | Account not found / not in the household |
| `409` | No savings category exists, nothing available to withdraw, or amount exceeds the available balance (response includes `availableCents`) |

---

## Analytics

### `GET /api/analytics/summary`

Current-month financial summary for the dashboard — what is booked, plus the recurring occurrences still **planned** for the month as a projection. **No query parameters** — the route always evaluates the current calendar month in Europe/Berlin, across **all accounts of the household**. Full field-by-field description: `docs/calculations/04-analytics-summary.md`.

Before calculating, the route books due, never-booked recurring occurrences of **completed** months for the household (see `POST /api/cron/materialize-recurring`) — this `GET` can write.

**Auth required:** Yes

> **Units:** all monetary fields are **euros** (already divided by 100) — except `recurringTransactions[].amountCents`, which stays in cents.

**Success response — `200 OK`:**
```json
{
  "totalBalance": 2986.6,
  "carryoverFromLastMonth": 1200,
  "incomeTotal": 3200,
  "outcomeTotal": 913.4,
  "outcomeTotalExclSavings": 913.4,
  "monthlySavingsActual": 500,
  "remaining": 1786.6,
  "plannedSavings": 500,
  "completedGoals": [],
  "completedGoalsSpent": 0,
  "projectedIncomeTotal": 3200,
  "projectedOutcomeTotal": 973.4,
  "projectedRemaining": 1726.6,
  "outgoingByCategory": [
    { "id": "cat_03", "name": "Miete", "amount": 850 },
    { "id": "cat_02", "name": "Lebensmittel", "amount": 63.4 },
    { "id": "cat_04", "name": "Strom", "amount": 60 }
  ],
  "categoryBudgets": [
    { "categoryId": "cat_02", "name": "Lebensmittel", "budget": 200, "spent": 63.4, "diff": -136.6 }
  ],
  "recurringTransactions": [
    { "id": "rec_02", "description": "Strom", "amountCents": -6000, "categoryId": "cat_04", "dayOfMonth": 20 }
  ],
  "recurringIncomeTotal": 0,
  "recurringOutcomeTotal": 60,
  "recurringPlannedSavings": 0,
  "recurringDueIncomeTotal": 0,
  "recurringDueOutcomeTotal": 910,
  "recurringDueCount": 2,
  "projectedSavingsTotal": 500,
  "daily": {
    "labels": ["1", "2", "3"],
    "income": [3200, 3200, 3200],
    "outcome": [850, 850, 913.4],
    "savings": [1000, 1000, 1500]
  }
}
```

(In this example the rent template was already booked on the 1st and the electricity template is due on the 20th.)

Notable semantics:

- **Booked:** `incomeTotal`, `outcomeTotal` (= `outcomeTotalExclSavings`), `monthlySavingsActual` and `remaining` cover the bookings of the current month only. `monthlySavingsActual` is **net** (deposits minus withdrawals) and can be negative. `remaining` = income − outcome − savings = the plain sum of the month's `amountCents`.
- **Balances:** `totalBalance` is the sum of all bookings up to the **end of the current month** — bookings pre-entered for later months do not count. `carryoverFromLastMonth` is the sum of all bookings before the start of the month.
- **Planned:** `recurringTransactions` lists the recurring templates that are due this month, not skipped and **not yet booked for this month's period**. `recurringIncomeTotal`, `recurringOutcomeTotal` and `recurringPlannedSavings` are their sums (savings templates only in `recurringPlannedSavings`, net). An occurrence counts as booked by `(recurringTransactionId, recurringPeriod)` — also when its booking was deleted or moved into another month.
- **Due:** `recurringDueIncomeTotal` and `recurringDueOutcomeTotal` are the sums of **all** templates due this month and not skipped, booked or not (without savings templates); `recurringDueCount` is their number (including savings templates). They stay constant over the month — the base for a fixed-cost ratio.
- **Projections:** `projected…Total` = booked + planned; `projectedRemaining` = `projectedIncomeTotal − projectedOutcomeTotal − projectedSavingsTotal` (the month's projected balance, **without** carryover). Once everything is booked the projections equal the booked totals and the review of that month.
- `outgoingByCategory` is an array: booked outcome plus planned recurring outcome per category; bookings and planned templates without a category go to `id: "uncategorized"`. Its amounts add up to `projectedOutcomeTotal`. Savings and income (including refunds) are not part of it.
- `categoryBudgets`: one entry per category with an effective budget (budget plan first; a per-month budget only for categories without a plan), also when `spent` is 0. `spent` is the same figure as in `outgoingByCategory` (booked plus planned). `diff` = `spent − budget` (positive = over budget).
- `plannedSavings` is the sum of the target amounts of all active saving goals whose target month is the current month; `completedGoals` are the goals whose `completedAt` falls into the current month.
- `daily` holds cumulative running totals per calendar day. It is still returned, but **no UI consumes it**.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | The household has no account |

---

### `GET /api/analytics/quarterly`

Rolling 3-month view (the two previous months plus the current one, Europe/Berlin calendar) of income, expenses, savings, and cumulative balance — booked figures only, across all accounts of the household. **No query parameters.** Like the summary, the route first books missed recurring occurrences of completed months.

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

All values are **integer cents**; the entries are ordered oldest month first. `balanceCents` is the account balance at the end of that month: the sum of **all** bookings before the month's end, not only those inside the window. `savingsCents` is net (deposits minus withdrawals) and can be negative. Classification as everywhere (savings category first, then sign). Each column equals the review of the same month (`GET /api/analytics/monthly-review`); for the current month, `balanceCents` equals `totalBalance` of the summary. There is no balance total.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | The household has no account |

---

### `GET /api/analytics/category-year?year=YYYY`

Actual bookings of a year per category and month (integer cents), grouped into expenses, income and savings, with group sums and balance (`income - expenses - savings`). Year and month are the Europe/Berlin calendar values of `occurredAt`; soft-deleted bookings and other years are excluded. All accounts of the household; no demo-account exclusion (nothing is aggregated across households). Like the summary, the route first books missed recurring occurrences of completed months.

The group is decided **per booking**, by the same rule as the review: savings category (name `savings`/`sparen`, trimmed, case-insensitive) → savings, otherwise the sign: `>= 0` income, `< 0` expense. `Category.isIncome` decides nothing. A category can therefore have a row in the income group (refunds) **and** one in the expense group (e.g. a negative booking in "Gehalt") at the same time. Income rows are positive as stored; expense rows are the **gross** spend as a positive magnitude (a refund does not reduce it); savings rows are net (deposits minus withdrawals, may be negative). Bookings without a category, or with a deleted one, appear as row `id: "uncategorized"`. Zero-amount bookings are ignored. The group totals of a month equal that month's review.

Each expense row carries the effective monthly budget (`budgetMonthlyCents`, 12 entries, `null` = no budget in that month; plan beats legacy `Budget`; YEARLY plans distributed like on `/budgets`), `budgetTotalCents`, `overMonths` (months 1-12 strictly above a positive budget) and `overYear` (spend of the budgeted months above their budget sum). Categories with a budget but no bookings appear as zero expense rows.

**Auth required:** Yes

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `year` | integer 2000-2100 | Optional; defaults to the current year in Europe/Berlin. Non-integers (e.g. `2036.5`) are rejected |

**Success response — `200 OK`:** `CategoryYearMatrix` (`@doewe/shared`)

```json
{
  "year": 2026,
  "expenses": {
    "rows": [
      { "id": "cat_01", "name": "Lebensmittel", "kind": "expense", "monthlyCents": [45000, "… 12 entries"], "totalCents": 540000,
        "budgetMonthlyCents": [50000, "… 12 entries"], "budgetTotalCents": 600000, "overMonths": [3], "overYear": false }
    ],
    "monthlyTotalsCents": [45000, "… 12 entries"],
    "totalCents": 540000
  },
  "income": { "rows": [], "monthlyTotalsCents": [], "totalCents": 0 },
  "savings": { "rows": [], "monthlyTotalsCents": [], "totalCents": 0 },
  "balanceMonthlyCents": [-45000, "… 12 entries"],
  "balanceTotalCents": -540000
}
```

**Error responses:**

| Status | Meaning |
|---|---|
| `400` | `{ "error": "Invalid query" }` — `year` invalid |
| `401` | Not authenticated |
| `404` | The household has no account |

---

### `GET /api/analytics/monthly-review?month=…&year=…`

Deep review of a **completed** past month: KPIs, carryover, expense breakdown by category, income by source, top expenses, and completed saving goals. Europe/Berlin calendar, all accounts of the household, booked figures only (no planned recurring). Like the summary, the route first books missed recurring occurrences of completed months.

**Auth required:** Yes

**Query parameters (optional):**

| Parameter | Type | Description |
|---|---|---|
| `month` | integer | 1–12. Default: last completed month |
| `year` | integer | 2000–2100. Default: year of the last completed month |

The route never answers `400` for these parameters. If either one is invalid (e.g. `month=23`, `year=abc`), or the requested month is the current month or a future one, the whole request falls back to the **last completed month**; the response's `month`/`year` say which month was evaluated. "Current month" is the Berlin month: at 00:30 on the 1st (still the previous day in UTC) the month that just ended is already available.

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
    { "id": "cat_02", "name": "Lebensmittel", "spentCents": 6340, "budgetCents": 20000, "transactionCount": 3,
      "transactions": [ { "id": "tx_11", "description": "Wocheneinkauf", "amountCents": 4200, "occurredAt": "2026-06-14T10:00:00.000Z", "accountId": "acc_01", "categoryId": "cat_02", "taxRelevant": false, "recurringTransactionId": null } ] }
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

(The `categories` and `transactions` arrays are abbreviated.)

Notable semantics:

- All monetary values are **integer cents**.
- Classification: bookings in a savings category are savings; everything else is income or expense by **amount sign** (`amountCents >= 0` = income), not by `Category.isIncome`. A refund in an expense category is income and does not reduce that category's `spentCents`.
- `savingsCents` is net (deposits minus withdrawals) and can be negative. `savingsRatePct` = `round(savingsCents / incomeCents × 100)`, **clamped to 0–100**; `0` when there is no income.
- `balanceAtStartCents` is the sum of all bookings before the start of the month (the carryover); `balanceAtEndCents` = `balanceAtStartCents + incomeCents − outcomeCents − savingsCents`. The end balance of a month equals the start balance of the next one and the dashboard's `carryoverFromLastMonth` in that next month.
- `categories[].budgetCents` is the effective budget of the month (budget plan first; a per-month budget only for categories without a plan), `null` without a budget. The sum of all `categories[].spentCents` equals `outcomeCents`.
- `categories` (expenses) is sorted over-budget first, then by spend descending; an `"uncategorized"` entry is appended when uncategorized spend exists. Each entry carries `transactions` (the month's individual expenses: `id`, `description`, positive `amountCents`, ISO `occurredAt`), sorted by amount descending, ties by date ascending; savings and income are excluded, budget-only categories return `[]`. `incomeCategories` is sorted by amount descending.
- Each `transactions[]` entry additionally carries `accountId`, `categoryId` (`null` when uncategorized), `taxRelevant` and `recurringTransactionId` (`null` unless the booking belongs to a recurring transaction) so the review page can open its edit dialog without a second request.
- `topExpenses` are the 5 largest single non-savings expenses (amounts reported positive).
- `availableMonths` lists every month from the earliest transaction up to (excluding) the current month, most recent first.
- `completedGoals` are the saving goals whose `completedAt` falls into the month (Europe/Berlin).
- `prevMonth` is `null` when the preceding month has no income, no outcome and no positive net savings.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | The household has no account |

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
