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

List all saving goals for the authenticated user.

**Auth required:** Yes

**Success response — `200 OK`:**
```json
[
  {
    "id": "svg_01",
    "accountId": "acc_01",
    "name": "Urlaub 2027",
    "targetCents": 300000,
    "targetDate": "2027-06-01T00:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "savedCents": 50000
  }
]
```

The `savedCents` field is computed as the sum of all transactions linked to this saving goal.

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |

---

### `POST /api/saving-plan`

Create a new saving goal.

**Auth required:** Yes

**Request body:**
```json
{
  "accountId": "acc_01",
  "name": "Urlaub 2027",
  "targetCents": 300000,
  "targetDate": "2027-06-01T00:00:00.000Z"
}
```

| Field | Type | Constraints |
|---|---|---|
| `accountId` | string | Required; must belong to user |
| `name` | string | Required; non-empty |
| `targetCents` | integer | Required; positive |
| `targetDate` | ISO date string | Required |

**Success response — `201 Created`:** Full saving goal object.

**Error responses:**

| Status | Reason |
|---|---|
| `400` | Validation failed |
| `401` | Not authenticated |

---

### `GET /api/saving-plan/[id]`

Get a single saving goal by ID.

**Auth required:** Yes

**Success response — `200 OK`:** Saving goal object (same shape as list item, including `savedCents`).

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
  "name": "Urlaub Griechenland 2027",
  "targetCents": 350000,
  "targetDate": "2027-07-01T00:00:00.000Z"
}
```

**Success response — `200 OK`:** Updated saving goal object.

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

**Success response — `204 No Content`**

**Error responses:**

| Status | Reason |
|---|---|
| `401` | Not authenticated |
| `404` | Not found or not owned by user |

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
