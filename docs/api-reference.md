# Doewe — API Reference

All routes are HTTP JSON APIs served under `/api`. Every route requires an active session unless noted otherwise. Authentication is enforced via `requireSessionUser()` (throws `401`) or `getSessionUser()` (returns null). All monetary values are integer euro cents.

**Base URL:** `https://<your-domain>/api`

**Auth mechanism:** Session cookie set by NextAuth on successful login. Include credentials in fetch calls (`credentials: "include"` or `same-origin`).

**Error format (all routes):**
```json
{ "error": "Human-readable message" }
```

---

## Authentication

### `POST /api/auth/register`

Register a new user account.

**Auth required:** No

**Request body:**
```json
{
  "email": "anna@example.de",
  "password": "min8chars"
}
```

| Field | Type | Constraints |
|---|---|---|
| `email` | string | Valid email format, unique |
| `password` | string | Minimum 8 characters |

**Success response — `201 Created`:**
```json
{ "id": "usr_01", "email": "anna@example.de" }
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Missing or invalid fields |
| `409` | Email already registered |

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

List all accounts belonging to the authenticated user.

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

## Categories

### `GET /api/categories`

List all categories belonging to the authenticated user.

**Auth required:** Yes

**Request body:** None

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
| `name` | string | Non-empty; unique per user |
| `isIncome` | boolean | `true` for income, `false` for expense |

**Success response — `201 Created`:**
```json
{ "id": "cat_02", "name": "Lebensmittel", "isIncome": false, "userId": "usr_01" }
```

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Missing or invalid fields |
| `401` | Not authenticated |
| `409` | Category name already exists for this user |

---

### `DELETE /api/categories/[id]`

Delete a category by ID. The category must belong to the authenticated user.

**Auth required:** Yes

**Request body:** None

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Category not found or not owned by user |

---

## Transactions

### `GET /api/transactions`

List all transactions for the authenticated user across all accounts.

**Auth required:** Yes

**Query parameters (optional):**

| Parameter | Type | Description |
|---|---|---|
| `accountId` | string | Filter by account |
| `categoryId` | string | Filter by category |
| `from` | ISO date string | Start date filter (inclusive) |
| `to` | ISO date string | End date filter (inclusive) |

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
  "savingGoalId": null,
  "amountCents": -6340,
  "description": "Rewe",
  "occurredAt": "2026-04-05T00:00:00.000Z"
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Required; must belong to user |
| `categoryId` | string or null | Optional category reference |
| `savingGoalId` | string or null | Optional saving goal reference |
| `amountCents` | integer | Required; non-zero; negative for expense |
| `description` | string | Required; non-empty |
| `occurredAt` | ISO date string | Required |

**Success response — `201 Created`:** Full transaction object (same shape as GET list item).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed (Zod error) |
| `401` | Not authenticated |
| `403` | `accountId` does not belong to authenticated user |

---

### `PATCH /api/transactions/[id]`

Update an existing transaction. Send only the fields to change (partial update).

**Auth required:** Yes

**Request body (all fields optional):**
```json
{
  "amountCents": -7000,
  "description": "Rewe updated",
  "categoryId": "cat_02",
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

## Recurring Transactions

### `GET /api/recurring-transactions`

List all recurring transactions for the authenticated user.

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
    "frequency": "monthly",
    "intervalMonths": 1,
    "dayOfMonth": 1,
    "nextOccurrence": "2026-05-01T00:00:00.000Z",
    "skips": []
  }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/recurring-transactions`

Create a new recurring transaction template.

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "categoryId": "cat_03",
  "amountCents": -85000,
  "description": "Miete",
  "frequency": "monthly",
  "intervalMonths": 1,
  "dayOfMonth": 1,
  "nextOccurrence": "2026-05-01T00:00:00.000Z"
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Required; must belong to user |
| `categoryId` | string or null | Optional |
| `amountCents` | integer | Required; non-zero |
| `description` | string | Required; non-empty |
| `frequency` | string | Required (e.g., `"monthly"`, `"quarterly"`) |
| `intervalMonths` | integer | Required; >= 1 |
| `dayOfMonth` | integer | Required; 1–31 |
| `nextOccurrence` | ISO date string | Required |

**Success response — `201 Created`:** Full recurring transaction object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `403` | Account not owned by user |

---

### `PATCH /api/recurring-transactions/[id]`

Update a recurring transaction template. Partial update — send only changed fields.

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

Delete a recurring transaction template and all its skip records.

**Auth required:** Yes

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Not found or not owned by user |

---

## Recurring Transaction Skips

### `GET /api/recurring-transactions/skips`

List all skips for all recurring transactions belonging to the authenticated user.

**Auth required:** Yes

**Query parameters (optional):**

| Parameter | Type | Description |
|---|---|---|
| `recurringId` | string | Filter to one recurring transaction |
| `year` | integer | Filter by year |
| `month` | integer | Filter by month (1–12) |

**Success response — `200 OK`:**
```json
[
  { "id": "skp_01", "recurringId": "rec_01", "year": 2026, "month": 5 }
]
```

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/recurring-transactions/skips`

Skip a specific month for a recurring transaction.

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
| `400` | Validation failed or skip already exists |
| `401` | Not authenticated |
| `403` | Recurring transaction not owned by user |

---

### `DELETE /api/recurring-transactions/skips`

Remove a skip (un-skip a month).

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
| `404` | Skip record not found |

---

## Budgets

### `GET /api/budgets`

List all budgets for the authenticated user.

**Auth required:** Yes

**Query parameters (optional):**

| Parameter | Type | Description |
|---|---|---|
| `month` | integer | Filter by month (1–12) |
| `year` | integer | Filter by year |
| `accountId` | string | Filter by account |

**Success response — `200 OK`:**
```json
[
  {
    "id": "bud_01",
    "accountId": "acc_01",
    "categoryId": "cat_02",
    "title": "Lebensmittel",
    "month": 4,
    "year": 2026,
    "amountCents": 20000,
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

Create a new budget for a category and month.

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "categoryId": "cat_02",
  "title": "Lebensmittel",
  "month": 4,
  "year": 2026,
  "amountCents": 20000
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Required; must belong to user |
| `categoryId` | string or null | Optional; unique per (account, category, month, year) |
| `title` | string | Required; non-empty |
| `month` | integer | 1–12 |
| `year` | integer | Four-digit year |
| `amountCents` | integer | Required; positive |

**Success response — `201 Created`:** Full budget object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `409` | Budget for this (account, category, month, year) already exists |

---

## Saving Plan

### `GET /api/saving-plan`

List saving goals for the authenticated user, split into active and completed, plus the computed plan totals. Saving goals are stored as `Budget` rows with `categoryId = null`.

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
  "completedGoals": [
    {
      "id": "bud_05",
      "accountId": "acc_01",
      "categoryId": null,
      "categoryName": null,
      "title": "Laptop",
      "month": 3,
      "year": 2026,
      "amountCents": 120000,
      "transactionSpentCents": 0,
      "completedAt": "2026-03-20T10:00:00.000Z",
      "spentCents": 115000,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "totals": {
    "rawAvailableCents": 200000,
    "withdrawnForCompletedCents": 115000,
    "availableCents": 85000,
    "totalTargetCents": 300000,
    "suggestedMonthlyCents": 21667
  }
}
```

- `goals` contains only **active** goals (`completedAt == null`); `completedGoals` contains closed goals (same fields).
- `transactionSpentCents` is the absolute sum of transactions linked to the goal via `savingGoalId`.
- `totals.rawAvailableCents` is the raw savings balance; `availableCents = max(rawAvailableCents − withdrawnForCompletedCents, 0)` is the pool for the remaining active goals. `totalTargetCents` and `suggestedMonthlyCents` consider only active goals. See `docs/calculations/07-sparziele.md`.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | No account found for user |

---

### `POST /api/saving-plan`

Create a new saving goal.

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
| `targetMonth` | integer | Required; 1–12. Aliases accepted: `month`, `dueMonth` |
| `targetYear` | integer | Required; 1970–9999. Aliases accepted: `year`, `dueYear` |
| `amountCents` | integer | Required; `>= 1` |

**Success response — `201 Created`:** The created `Budget` row (`id`, `accountId`, `categoryId: null`, `title`, `month`, `year`, `amountCents`, `completedAt: null`, `spentCents: null`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |

---

### `GET /api/saving-plan/[id]`

Get a single saving goal by ID.

**Auth required:** Yes

**Success response — `200 OK`:** Saving goal object (`id`, `accountId`, `categoryId`, `categoryName`, `title`, `month`, `year`, `amountCents`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Not found or not owned by user |

---

### `PATCH /api/saving-plan/[id]`

Update a saving goal. Partial update.

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
| `targetMonth` | integer | Optional; 1–12. Alias accepted: `month` |
| `targetYear` | integer | Optional; 1970–9999. Alias accepted: `year` |
| `amountCents` | integer | Optional; `>= 1` |

**Success response — `200 OK`:** Updated saving goal object (`id`, `accountId`, `categoryId`, `categoryName`, `title`, `month`, `year`, `amountCents`, `createdAt`).

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |
| `404` | Not found or not owned by user |

---

### `DELETE /api/saving-plan/[id]`

Delete a saving goal. Linked transactions lose their `savingGoalId` (set to null) rather than being deleted.

**Auth required:** Yes

**Success response — `200 OK`:** `{ "success": true }`

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Not found or not owned by user |

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

## Analytics

### `GET /api/analytics/summary`

Return the current-month financial summary for the authenticated user's dashboard.

**Auth required:** Yes

**Query parameters (optional):**

| Parameter | Type | Description |
|---|---|---|
| `month` | integer | Month to query (default: current month) |
| `year` | integer | Year to query (default: current year) |
| `accountId` | string | Scope to one account (default: all accounts) |

**Success response — `200 OK`:**
```json
{
  "income": 320000,
  "outcome": 94440,
  "savings": 50000,
  "budgets": [
    {
      "categoryId": "cat_02",
      "categoryName": "Lebensmittel",
      "budgetCents": 20000,
      "actualCents": 6340,
      "remainingCents": 13660
    }
  ],
  "recurring": [
    {
      "id": "rec_01",
      "description": "Miete",
      "amountCents": -85000,
      "skipped": false
    }
  ],
  "dailyChart": [
    { "date": "2026-04-01", "incomeCents": 320000, "expenseCents": 0 },
    { "date": "2026-04-02", "incomeCents": 0, "expenseCents": 85000 }
  ]
}
```

| Field | Description |
|---|---|
| `income` | Sum of positive `amountCents` for the month (excluding savings category) |
| `outcome` | Absolute sum of negative `amountCents` for the month (excluding savings category) |
| `savings` | Absolute sum of `amountCents` in the savings category for the month |
| `budgets` | Budget vs. actual breakdown per category that has a budget this month |
| `recurring` | Recurring transactions expected this month, with skip status |
| `dailyChart` | Day-by-day income and expense totals for chart rendering |

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `GET /api/analytics/quarterly`

Return a 3-month rolling view of income, expenses, and savings.

**Auth required:** Yes

**Query parameters (optional):**

| Parameter | Type | Description |
|---|---|---|
| `endMonth` | integer | Last month of the 3-month window (default: current month) |
| `endYear` | integer | Year of the last month |
| `accountId` | string | Scope to one account |

**Success response — `200 OK`:**
```json
[
  { "month": 2, "year": 2026, "income": 320000, "outcome": 88000, "savings": 50000 },
  { "month": 3, "year": 2026, "income": 320000, "outcome": 91000, "savings": 50000 },
  { "month": 4, "year": 2026, "income": 320000, "outcome": 94440, "savings": 50000 }
]
```

Each array item covers one calendar month with aggregated totals using the same income/outcome/savings definitions as the summary endpoint.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
