# Doewe — User Flows

This document describes the five core user flows with sequence diagrams and explanatory notes.

---

## Flow 1: Transaction Entry

A user adds a new expense transaction via the transaction form.

```mermaid
sequenceDiagram
    actor User
    participant UI as TransactionForm (Client)
    participant Shared as @doewe/shared
    participant API as POST /api/transactions
    participant Auth as requireSessionUser()
    participant Zod as transactionSchema (Zod)
    participant ORM as Prisma
    participant DB as PostgreSQL

    User->>UI: Opens TransactionForm modal
    User->>UI: Enters: amount=42.50, description=Rewe, category=Lebensmittel, date=today

    UI->>Shared: parseCents("42.50") → -4250 (expense, negated by UI)
    UI->>API: POST /api/transactions\nbody: { accountId, categoryId, amountCents: -4250, description, occurredAt }

    API->>Auth: getSessionUser(request)
    Auth-->>API: { id: "usr_01", email: "anna@example.de" }

    API->>Zod: transactionSchema.parse(body)
    Zod-->>API: Validated payload

    API->>ORM: prisma.account.findFirst({ where: { id: accountId, userId } })
    ORM->>DB: SELECT * FROM Account WHERE id=? AND userId=?
    DB-->>ORM: Account row
    ORM-->>API: Account confirmed

    API->>ORM: prisma.transaction.create({ data: validatedPayload })
    ORM->>DB: INSERT INTO Transaction ...
    DB-->>ORM: New Transaction row
    ORM-->>API: Transaction object

    API-->>UI: 201 Created + Transaction JSON

    UI->>UI: router.refresh() — invalidates Server Component cache
    UI-->>User: Transaction appears in list; modal closes
```

The UI negates the user-entered amount (42.50 becomes −4250 cents) before sending, because the API stores expenses as negative values. The auth check happens before any database access — if the session is missing, the request never touches Prisma. After the API returns 201, the Next.js `router.refresh()` call re-fetches the page data server-side, causing the transaction list to update without a full page reload.

---

## Flow 2: Recurring Transaction

A user creates a monthly recurring payment; it then appears in the analytics summary.

```mermaid
sequenceDiagram
    actor User
    participant UI as RecurringTransactionForm
    participant API_Create as POST /api/recurring-transactions
    participant API_Summary as GET /api/analytics/summary
    participant ORM as Prisma
    participant DB as PostgreSQL

    User->>UI: Fills in: description=Miete, amount=850, day=1, interval=monthly
    UI->>API_Create: POST /api/recurring-transactions\n{ accountId, description, amountCents: -85000,\n  intervalMonths: 1, dayOfMonth: 1, nextOccurrence: 2026-05-01 }
    API_Create->>ORM: prisma.recurringTransaction.create(...)
    ORM->>DB: INSERT INTO RecurringTransaction ...
    DB-->>ORM: New row
    ORM-->>API_Create: RecurringTransaction object
    API_Create-->>UI: 201 Created

    Note over UI: User navigates to dashboard

    UI->>API_Summary: GET /api/analytics/summary?month=5&year=2026
    API_Summary->>ORM: prisma.recurringTransaction.findMany\n({ where: { account: { userId }, nextOccurrence: in May 2026 } })
    ORM->>DB: SELECT + JOIN RecurringTransactionSkip
    DB-->>ORM: [{ id: rec_01, amountCents: -85000, skipped: false }]
    ORM-->>API_Summary: Recurring list with skip status

    API_Summary-->>UI: summary JSON includes recurring:[{ description: "Miete", skipped: false }]
    UI-->>User: Dashboard shows "Miete 850,00 EUR" in recurring section
```

When the recurring transaction is created, a `nextOccurrence` date is stored; the application uses this field to decide which recurring transactions fall in the current viewing month. The analytics summary endpoint joins `RecurringTransactionSkip` records to mark any occurrences the user has explicitly skipped, so the dashboard distinguishes expected-and-active from expected-but-skipped payments.

---

## Flow 3: Budget Tracking

A user sets a monthly budget for the "Lebensmittel" category, and the dashboard renders the budget vs. actual comparison.

```mermaid
sequenceDiagram
    actor User
    participant BudgetUI as Budget Form (Client)
    participant API_Budget as POST /api/budgets
    participant API_Summary as GET /api/analytics/summary
    participant ORM as Prisma
    participant DB as PostgreSQL

    User->>BudgetUI: Sets budget: Lebensmittel, April 2026, 200 EUR
    BudgetUI->>API_Budget: POST /api/budgets\n{ accountId, categoryId: "cat_02",\n  title: "Lebensmittel", month: 4, year: 2026,\n  amountCents: 20000 }

    API_Budget->>ORM: prisma.budget.create(...)
    ORM->>DB: INSERT INTO Budget ...
    DB-->>ORM: Budget row
    ORM-->>API_Budget: Budget object
    API_Budget-->>BudgetUI: 201 Created

    Note over BudgetUI: User opens dashboard

    BudgetUI->>API_Summary: GET /api/analytics/summary?month=4&year=2026
    API_Summary->>ORM: prisma.budget.findMany({ where: { account: { userId }, month: 4, year: 2026 } })
    ORM->>DB: SELECT Budget WHERE month=4 AND year=2026 AND account.userId=?
    DB-->>ORM: [{ categoryId: cat_02, amountCents: 20000 }]

    API_Summary->>ORM: prisma.transaction.groupBy({ by: [categoryId],\n  where: { occurredAt in April 2026, account.userId } })
    ORM->>DB: SELECT categoryId, SUM(amountCents) FROM Transaction ...
    DB-->>ORM: [{ categoryId: cat_02, _sum: { amountCents: -6340 } }]

    API_Summary->>API_Summary: Join: budget 20000, actual 6340 → remaining 13660
    API_Summary-->>BudgetUI: budgets: [{ categoryName: "Lebensmittel", budgetCents: 20000,\n  actualCents: 6340, remainingCents: 13660 }]

    BudgetUI-->>User: Progress bar: 31.7% used (6,34 / 200,00 EUR)
```

The budget form POSTs with a positive `amountCents` (budgets are always limits, not signed values). The analytics endpoint fetches both the budgets and a `groupBy` aggregation of actual transactions for the same month and category. It joins the two datasets in application code, computing `remainingCents = budgetCents - actualCents`. The UI renders a progress bar for each budget line.

---

## Flow 4: Skip a Recurring Transaction

A user skips next month's rent payment (e.g., because prepaid), and the dashboard reflects this.

```mermaid
sequenceDiagram
    actor User
    participant Dashboard as Dashboard (Client)
    participant API_Skip as POST /api/recurring-transactions/skips
    participant API_Summary as GET /api/analytics/summary
    participant ORM as Prisma
    participant DB as PostgreSQL

    User->>Dashboard: Sees "Miete" in May recurring list
    User->>Dashboard: Clicks "Skip for May 2026"

    Dashboard->>API_Skip: POST /api/recurring-transactions/skips\n{ recurringId: "rec_01", year: 2026, month: 5 }
    API_Skip->>ORM: prisma.recurringTransaction.findFirst\n({ where: { id: recurringId, account: { userId } } })
    ORM-->>API_Skip: Confirms ownership

    API_Skip->>ORM: prisma.recurringTransactionSkip.create\n({ data: { recurringId, year: 2026, month: 5 } })
    ORM->>DB: INSERT INTO RecurringTransactionSkip ...
    DB-->>ORM: Skip row
    ORM-->>API_Skip: Skip object
    API_Skip-->>Dashboard: 201 Created

    Dashboard->>API_Summary: GET /api/analytics/summary?month=5&year=2026
    API_Summary->>ORM: findMany RecurringTransactions + include skips for month=5
    ORM->>DB: SELECT RecurringTransaction LEFT JOIN RecurringTransactionSkip\n  ON recurringId=id AND year=2026 AND month=5
    DB-->>ORM: [{ id: rec_01, ..., skips: [{ year: 2026, month: 5 }] }]
    ORM-->>API_Summary: Recurring with skip flagged

    API_Summary-->>Dashboard: recurring: [{ description: "Miete", amountCents: -85000, skipped: true }]
    Dashboard-->>User: "Miete" shown with strikethrough / skipped badge
```

Creating a skip does not delete the `RecurringTransaction` — the template stays intact for future months. The unique constraint on `(recurringId, year, month)` prevents double-skipping. To un-skip, the user sends `DELETE /api/recurring-transactions/skips` with the same body, which removes the skip record; on the next `GET /api/analytics/summary` call the occurrence reappears as active.

---

## Flow 5: Monthly Analytics — How the Summary Is Built

The dashboard calls `GET /api/analytics/summary` and the endpoint assembles all dashboard numbers in a single request.

```mermaid
flowchart TD
    A[GET /api/analytics/summary\nmonth=4 year=2026] --> B[requireSessionUser]
    B --> C{Session valid?}
    C -- No --> ERR[401 Unauthorized]
    C -- Yes --> D[Fetch all transactions\nfor month+year via account.userId]

    D --> E[Split by sign and category]
    E --> F[income =\nSUM where amountCents > 0\nAND category != savings]
    E --> G[outcome =\nABS SUM where amountCents < 0\nAND category != savings]
    E --> H[savings =\nABS SUM where category.name\nmatches savings or sparen]

    D --> I[Fetch budgets for month+year]
    I --> J[GROUP transactions by categoryId\nfor the same month]
    J --> K[Join budget vs actual\ncompute remainingCents per category]

    D --> L[Fetch recurring transactions\nwhere nextOccurrence in month]
    L --> M[LEFT JOIN skips for year+month]
    M --> N[Mark each as skipped true or false]

    D --> O[GROUP transactions by date\nSUM income and expense per day]
    O --> P[dailyChart array\none entry per calendar day]

    F --> RESP[Build response object]
    G --> RESP
    H --> RESP
    K --> RESP
    N --> RESP
    P --> RESP

    RESP --> Q[200 OK — JSON response]
```

The summary endpoint runs several Prisma queries in parallel (or sequentially depending on the implementation): one for all transactions in the target month, one for budgets, one for recurring transactions including their skips. It then performs all aggregation and joining in TypeScript application code — there is no single SQL query that computes everything. The `savings` amount is extracted by filtering transactions whose category name matches the savings convention before computing income and outcome, so savings contributions do not inflate the expense total. The `dailyChart` array is built by grouping transactions by their `occurredAt` date and summing positive and negative amounts separately, giving the client the data it needs to render a bar or line chart without additional processing.
