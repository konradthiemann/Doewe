"""
Importer for 'Haushalt 2026.xlsx' -> a target Doewe Postgres (local or Prod).

Modes:
  --dry-run  : print a full plan, write nothing
  --apply    : execute the plan inside a single DB transaction

Required arguments:
  --db-url       Postgres connection string
  --account-id   Target Account.id (transactions + recurring are deleted/replaced for this account)
  --user-email   Owner email (used to resolve Category.userId)

Scope: months Jan-Apr 2026 only. Budgets on the target account are NOT touched.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime

import psycopg2
import psycopg2.extras
from openpyxl import load_workbook

DEFAULT_XLSX = os.path.expanduser("~/Downloads/Haushalt 2026.xlsx")
YEAR = 2026
MONTH_COLS = {1: "C", 2: "D", 3: "E", 4: "F"}  # Jan–Apr only
DEFAULT_DAY = 15

# Row → (ExcelLabel, ProdCategory, isIncome, descPrefix|None)
# Categories are the DE names actually used on the target account.
INCOME_ROWS = {
    2: ("Gehalt K", "Gehalt", True, "K"),
    3: ("Gehalt C", "Gehalt", True, "C"),
    4: ("Kindergeld", "Kindergeld", True, None),
    5: ("Sonstiges (Einn.)", "Other income", True, None),
}

# Alltagsausgaben (Z. 8–26)
OUTCOME_ROWS = {
    8: ("Lebensmittel", "Lebensmittel", False, None),
    9: ("Drogerie/Haushalt", "Drogerie/Haushalt", False, None),
    10: ("Kosmetik", "Kosmetik", False, None),
    11: ("Bestellen", "Bestellen", False, None),
    12: ("Essen gehen", "Essen gehen/Ausgehen", False, "Essen gehen"),
    13: ("Ausgehen", "Essen gehen/Ausgehen", False, "Ausgehen"),
    14: ("Kleidung Charlie", "Kleidung Charlie", False, None),
    15: ("Kleidung Konni", "Kleidung Konni", False, None),
    16: ("Einkäufe Milan", "Einkäufe Milan", False, None),
    17: ("Einkäufe Liana", "Einkäufe Liana", False, None),
    18: ("Freizeit", "Freizeit", False, None),
    19: ("Hobbies", "Hobbies", False, None),
    20: ("Interior", "Interieur", False, None),
    21: ("Geschenke", "Geschenke", False, None),
    22: ("Essen unterwegs", "Essen unterwegs", False, None),
    23: ("Gesundheit", "Gesundheit", False, None),
    24: ("Mobilität/Tanken", "Mobilität/Tanken", False, None),
    25: ("Besonderes", "Besonderes", False, None),
    26: ("Sonstiges", "Sonstiges", False, None),
}

YEARLY_CATEGORY = "Jährliche Ausgaben"
YEARLY_ROWS = {
    29: "Golf Steuer",
    30: "GEZ",
    31: "Prime",
    32: "ADAC",
    33: "Mieterschutz",
    34: "Schule Förderverein",
    35: "Mietkaution",
    36: "BZ Abo",
}

SAVINGS_CATEGORY = "Sparen"
SAVINGS_ROWS = {
    38: ("Sparen", "Sparen"),
    39: ("Mili", "Mili"),
    40: ("Liana", "Liana"),
    41: ("Charlie Depot", "Charlie Depot"),
}

# Monatliche Fixkosten (Z. 43–66): (excelLabel, prodCategory, mode)
# mode = "recurring"  → latest non-zero month becomes Recurring; deviating months go as single TX
#        "single"     → every non-zero month is a single TX (no Recurring)
#        "skip_zero"  → if all months are zero, skip the row
FIXED_COST_ROWS = {
    43: ("Miete", "Miete", "recurring"),
    44: ("Strom & Gas", "Strom & Gas", "recurring"),
    45: ("Internet / TV", "Internet / TV", "recurring"),
    46: ("Handy K", "Handy Konni", "recurring"),
    47: ("Handy C", "Handy Charlie", "recurring"),
    48: ("audible", "Mitgliedschaften", "skip_zero"),
    49: ("Kindle unlimited", "Mitgliedschaften", "recurring"),
    50: ("Spotify family", "Mitgliedschaften", "recurring"),
    51: ("Hausrat", "Versicherungen", "recurring"),
    52: ("Zahnzusatz K", "Versicherungen", "recurring"),
    53: ("Zahnzusatz C", "Versicherungen", "recurring"),
    54: ("Haftpflicht", "Versicherungen", "recurring"),
    55: ("BU C", "Versicherungen", "recurring"),
    56: ("Rechtsschutz", "Versicherungen", "recurring"),
    57: ("KFZ-Vers.", "Versicherungen", "single"),
    58: ("apollo", "Mitgliedschaften", "recurring"),
    59: ("Verdi", "Mitgliedschaften", "recurring"),
    60: ("Hort", "Kinderbetreuung", "recurring"),
    61: ("Kita", "Kinderbetreuung", "recurring"),
    62: ("Essensgeld M.", "Kinderbetreuung", "recurring"),
    63: ("I-cloud", "Mitgliedschaften", "recurring"),
    64: ("Internetseit Konni", "Mitgliedschaften", "recurring"),
    65: ("Hansefit", "Mitgliedschaften", "recurring"),
    66: ("Kreditkarte->tolino", "Mitgliedschaften", "recurring"),
}


# ---------- Parsing ----------

AMOUNT_RE = re.compile(r"(?P<amount>\d{1,6}(?:[.,]\d{1,2})?)\s*€")
AMOUNT_FALLBACK_RE = re.compile(r"^\s*(?P<amount>\d{1,6}(?:[.,]\d{1,2})?)\s*[)&h]\s*(€\s*)?\S")
INLINE_DATE_RE = re.compile(r"(?P<d>\d{1,2})\.(?P<m>\d{1,2})\.")


def parse_amount(s: str) -> float:
    return float(s.replace(".", "").replace(",", ".") if s.count(",") == 1 else s.replace(",", "."))


def parse_note_lines(note: str, month: int) -> list[dict]:
    out = []
    if not note:
        return out
    for raw_line in note.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        m = AMOUNT_RE.search(line)
        if not m:
            m = AMOUNT_FALLBACK_RE.match(line)
            if not m:
                continue
        amount = parse_amount(m.group("amount"))
        desc = (line[: m.start()] + line[m.end():]).strip(" -,;:\t")
        day = DEFAULT_DAY
        dm = INLINE_DATE_RE.search(line)
        if dm:
            try:
                d = int(dm.group("d"))
                mm = int(dm.group("m"))
                if 1 <= d <= 31 and mm == month:
                    day = d
            except ValueError:
                pass
        if dm:
            desc = (desc[: dm.start()] + desc[dm.end():]).strip(" -,;:\t")
        if not desc:
            desc = "(no description)"
        out.append({
            "amount_cents": int(round(amount * 100)),
            "description": desc,
            "day": day,
        })
    return out


# ---------- Plan types ----------

@dataclass
class PlannedTx:
    month: int
    day: int
    category: str | None
    is_income: bool
    description: str
    amount_cents: int  # signed


@dataclass
class PlannedRecurring:
    category: str | None
    description: str
    amount_cents: int  # signed
    day_of_month: int


@dataclass
class ImportPlan:
    transactions: list[PlannedTx] = field(default_factory=list)
    recurring: list[PlannedRecurring] = field(default_factory=list)
    required_categories: set[tuple[str, bool]] = field(default_factory=set)
    unparsed_lines: list[tuple[str, int, str]] = field(default_factory=list)


# ---------- Plan builder ----------

def _add_tx_from_note(plan: ImportPlan, note: str, month: int, category: str | None,
                      is_income: bool, prefix: str | None, cell_ref: str):
    parsed = parse_note_lines(note, month)
    for p in parsed:
        desc = p["description"]
        if prefix:
            desc = f"{prefix}: {desc}"
        plan.transactions.append(PlannedTx(
            month=month, day=p["day"], category=category, is_income=is_income,
            description=desc,
            amount_cents=p["amount_cents"] if is_income else -p["amount_cents"],
        ))
    for raw_line in (note or "").splitlines():
        line = raw_line.strip()
        if line and not AMOUNT_RE.search(line) and not AMOUNT_FALLBACK_RE.match(line):
            plan.unparsed_lines.append((cell_ref, month, line))


def build_plan(wb_path: str) -> ImportPlan:
    wb = load_workbook(wb_path, data_only=False)
    ws = wb["Tabellenblatt1"]
    plan = ImportPlan()

    # --- Income (Z. 2–5) ---
    for row, (label, cat, is_income, prefix) in INCOME_ROWS.items():
        plan.required_categories.add((cat, is_income))
        for month, col in MONTH_COLS.items():
            cell = ws[f"{col}{row}"]
            val = cell.value
            note = cell.comment.text if cell.comment else None
            if note:
                _add_tx_from_note(plan, note, month, cat, is_income, prefix, f"{col}{row}")
            elif isinstance(val, (int, float)) and val and val != 0:
                desc = f"{prefix}: {label}" if prefix else label
                plan.transactions.append(PlannedTx(
                    month=month, day=DEFAULT_DAY, category=cat, is_income=is_income,
                    description=desc, amount_cents=int(round(float(val) * 100)),
                ))

    # --- Alltagsausgaben (Z. 8–26) ---
    for row, (label, cat, is_income, prefix) in OUTCOME_ROWS.items():
        plan.required_categories.add((cat, is_income))
        for month, col in MONTH_COLS.items():
            cell = ws[f"{col}{row}"]
            val = cell.value
            note = cell.comment.text if cell.comment else None
            if note:
                _add_tx_from_note(plan, note, month, cat, is_income, prefix, f"{col}{row}")
            elif isinstance(val, (int, float)) and val and val != 0:
                desc = f"{prefix}: {label}" if prefix else label
                plan.transactions.append(PlannedTx(
                    month=month, day=DEFAULT_DAY, category=cat, is_income=False,
                    description=desc, amount_cents=-int(round(float(val) * 100)),
                ))

    # --- Jährliche Posten (Z. 29–36) ---
    plan.required_categories.add((YEARLY_CATEGORY, False))
    for row, label in YEARLY_ROWS.items():
        for month, col in MONTH_COLS.items():
            val = ws[f"{col}{row}"].value
            if isinstance(val, (int, float)) and val and val > 0:
                plan.transactions.append(PlannedTx(
                    month=month, day=DEFAULT_DAY, category=YEARLY_CATEGORY, is_income=False,
                    description=label, amount_cents=-int(round(float(val) * 100)),
                ))

    # --- Sparen (Z. 38–41) ---
    plan.required_categories.add((SAVINGS_CATEGORY, False))
    for row, (label, prefix) in SAVINGS_ROWS.items():
        for month, col in MONTH_COLS.items():
            cell = ws[f"{col}{row}"]
            val = cell.value
            note = cell.comment.text if cell.comment else None
            if note:
                _add_tx_from_note(plan, note, month, SAVINGS_CATEGORY, False, prefix, f"{col}{row}")
            elif isinstance(val, (int, float)) and val and val > 0:
                plan.transactions.append(PlannedTx(
                    month=month, day=DEFAULT_DAY, category=SAVINGS_CATEGORY, is_income=False,
                    description=f"{prefix}: {label}", amount_cents=-int(round(float(val) * 100)),
                ))

    # --- Monatliche Fixkosten (Z. 43–66) ---
    for row, (label, cat, mode) in FIXED_COST_ROWS.items():
        plan.required_categories.add((cat, False))
        values = {m: ws[f"{c}{row}"].value for m, c in MONTH_COLS.items()}
        numeric = {m: float(v) for m, v in values.items() if isinstance(v, (int, float))}

        if mode == "skip_zero" and all((v or 0) == 0 for v in numeric.values()):
            continue

        if mode == "single":
            for m, v in numeric.items():
                if v and v > 0:
                    plan.transactions.append(PlannedTx(
                        month=m, day=DEFAULT_DAY, category=cat, is_income=False,
                        description=label, amount_cents=-int(round(v * 100)),
                    ))
            continue

        if mode == "recurring":
            latest = numeric.get(max(numeric.keys())) if numeric else None
            if latest is None or latest <= 0:
                continue
            plan.recurring.append(PlannedRecurring(
                category=cat, description=label,
                amount_cents=-int(round(latest * 100)), day_of_month=1,
            ))
            for m, v in numeric.items():
                if v is None or v <= 0:
                    continue
                if abs(v - latest) > 0.01:
                    plan.transactions.append(PlannedTx(
                        month=m, day=DEFAULT_DAY, category=cat, is_income=False,
                        description=f"{label} (abweichend)", amount_cents=-int(round(v * 100)),
                    ))

    return plan


# ---------- Reporting ----------

def print_plan_summary(plan: ImportPlan, account_id: str):
    print("=" * 72)
    print(f"IMPORT PLAN — Haushalt 2026.xlsx → account {account_id}")
    print("=" * 72)

    print("\nCategories required (will be created if missing):")
    for name, is_inc in sorted(plan.required_categories):
        print(f"  - {name}  (income={is_inc})")

    print(f"\nRecurring transactions: {len(plan.recurring)}")
    for r in plan.recurring:
        sign = "+" if r.amount_cents >= 0 else "-"
        print(f"  - {sign}{abs(r.amount_cents)/100:>8.2f} € | {r.category or '—':<24} | {r.description}")

    print(f"\nSingle transactions: {len(plan.transactions)}")
    by_month_cat: dict = defaultdict(lambda: defaultdict(lambda: {"count": 0, "in": 0, "out": 0}))
    for t in plan.transactions:
        entry = by_month_cat[t.month][t.category or "—"]
        entry["count"] += 1
        if t.amount_cents >= 0:
            entry["in"] += t.amount_cents
        else:
            entry["out"] += -t.amount_cents

    for m in sorted(by_month_cat):
        total_in = sum(c["in"] for c in by_month_cat[m].values())
        total_out = sum(c["out"] for c in by_month_cat[m].values())
        n_total = sum(c["count"] for c in by_month_cat[m].values())
        print(f"\n  -- Month {m:02d}/{YEAR} --  {n_total} TX"
              f"   income={total_in/100:.2f}€  outcome={total_out/100:.2f}€")
        for cat, v in sorted(by_month_cat[m].items()):
            parts = []
            if v["in"]:
                parts.append(f"+{v['in']/100:.2f}€")
            if v["out"]:
                parts.append(f"-{v['out']/100:.2f}€")
            print(f"     {cat:<24}  n={v['count']:>3}  {', '.join(parts)}")

    if plan.unparsed_lines:
        print(f"\nUnparsed note lines (skipped — review if needed): {len(plan.unparsed_lines)}")
        for cell, month, line in plan.unparsed_lines[:30]:
            print(f"  {cell} (m={month}): {line!r}")
        if len(plan.unparsed_lines) > 30:
            print(f"  ... and {len(plan.unparsed_lines) - 30} more")


# ---------- DB apply ----------

def apply_plan(plan: ImportPlan, db_url: str, account_id: str, user_email: str):
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute('SELECT id FROM "User" WHERE email = %s', (user_email,))
            user = cur.fetchone()
            if not user:
                raise RuntimeError(f"user {user_email} not found")
            user_id = user["id"]

            cur.execute('SELECT "userId" FROM "Account" WHERE id = %s', (account_id,))
            acc = cur.fetchone()
            if not acc:
                raise RuntimeError(f"account {account_id} not found")
            if acc["userId"] != user_id:
                raise RuntimeError(
                    f"account {account_id} belongs to {acc['userId']}, not {user_id} ({user_email})"
                )

            # Wipe transactions + recurring on target account. Budgets are preserved.
            cur.execute(
                'DELETE FROM "RecurringTransactionSkip" WHERE "recurringId" IN '
                '(SELECT id FROM "RecurringTransaction" WHERE "accountId" = %s)',
                (account_id,),
            )
            cur.execute('DELETE FROM "RecurringTransaction" WHERE "accountId" = %s', (account_id,))
            cur.execute('DELETE FROM "Transaction" WHERE "accountId" = %s', (account_id,))

            cur.execute('SELECT id, name, "isIncome" FROM "Category" WHERE "userId" = %s', (user_id,))
            cats = {(r["name"], r["isIncome"]): r["id"] for r in cur.fetchall()}
            for name, is_inc in plan.required_categories:
                if (name, is_inc) in cats:
                    continue
                existing_same_name = [v for (n, _), v in cats.items() if n == name]
                if existing_same_name:
                    cur.execute('UPDATE "Category" SET "isIncome" = %s WHERE id = %s',
                                (is_inc, existing_same_name[0]))
                    cats[(name, is_inc)] = existing_same_name[0]
                    continue
                new_id = _cuid_like()
                cur.execute('INSERT INTO "Category" (id, name, "userId", "isIncome") VALUES (%s,%s,%s,%s)',
                            (new_id, name, user_id, is_inc))
                cats[(name, is_inc)] = new_id

            for t in plan.transactions:
                cat_id = None
                if t.category:
                    cat_id = cats.get((t.category, t.is_income))
                    if cat_id is None:
                        cat_id = next((v for (n, _), v in cats.items() if n == t.category), None)
                occurred = datetime(YEAR, t.month, min(t.day, _last_day_of(t.month)))
                new_id = _cuid_like()
                cur.execute(
                    'INSERT INTO "Transaction" (id,"accountId","categoryId","amountCents","description","occurredAt") '
                    'VALUES (%s,%s,%s,%s,%s,%s)',
                    (new_id, account_id, cat_id, t.amount_cents, t.description, occurred),
                )

            for r in plan.recurring:
                cat_id = None
                if r.category:
                    cat_id = next((v for (n, _), v in cats.items() if n == r.category), None)
                now = datetime.now()
                ny, nm = (now.year, now.month + 1) if now.month < 12 else (now.year + 1, 1)
                dom = min(r.day_of_month, _last_day_of_ym(ny, nm))
                next_occ = datetime(ny, nm, dom)
                new_id = _cuid_like()
                cur.execute(
                    'INSERT INTO "RecurringTransaction" '
                    '(id,"accountId","categoryId","amountCents","description",frequency,"intervalMonths","dayOfMonth","nextOccurrence") '
                    'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                    (new_id, account_id, cat_id, r.amount_cents, r.description,
                     "MONTHLY", 1, r.day_of_month, next_occ),
                )
        conn.commit()
        print("✅ applied.")
    except Exception:
        conn.rollback()
        print("❌ rolled back.")
        raise
    finally:
        conn.close()


def _last_day_of(month: int) -> int:
    return _last_day_of_ym(YEAR, month)


def _last_day_of_ym(y: int, m: int) -> int:
    from calendar import monthrange
    return monthrange(y, m)[1]


def _cuid_like() -> str:
    import secrets
    import string
    alphabet = string.ascii_lowercase + string.digits
    return "xlsx_" + "".join(secrets.choice(alphabet) for _ in range(20))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--db-url", required=True, help="Postgres connection string")
    ap.add_argument("--account-id", required=True, help="Target Account.id")
    ap.add_argument("--user-email", required=True, help="Owner email (resolves Category.userId)")
    ap.add_argument("--xlsx", default=DEFAULT_XLSX, help=f"Path to the Excel file (default: {DEFAULT_XLSX})")
    args = ap.parse_args()
    if not args.dry_run and not args.apply:
        print("Pass --dry-run or --apply", file=sys.stderr)
        sys.exit(2)
    plan = build_plan(args.xlsx)
    print_plan_summary(plan, args.account_id)
    if args.apply:
        print("\n--- APPLYING ---")
        apply_plan(plan, args.db_url, args.account_id, args.user_email)


if __name__ == "__main__":
    main()
