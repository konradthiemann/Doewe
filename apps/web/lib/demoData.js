/**
 * Generiert deterministische Demo-Daten über die letzten 36 Monate für den
 * geteilten Demo-Account. Wird sowohl vom Seed-Skript (`prisma/seed.js`) als
 * auch von der öffentlichen Demo-Route (`app/api/demo/seed`) verwendet, damit
 * lokale Entwicklung und Produktion exakt dieselben Daten erzeugen.
 *
 * Erhält die `PrismaClient`-Instanz als Argument (kein eigener Import), damit
 * das Modul laufzeit-agnostisch bleibt.
 *
 * Eigenschaften:
 * - Idempotent: bereits aktuelle Daten werden nicht dupliziert.
 * - Selbst-auffrischend: liegen die jüngsten Daten vor dem aktuellen Monat,
 *   werden die Demo-Daten gelöscht und neu generiert, damit die Demo „aktuell"
 *   bleibt, ohne über die Zeit zu veralten.
 * - Beträge deterministisch über einen Seeded-PRNG → stabile, reproduzierbare
 *   Demo bei jedem Lauf.
 */
const bcrypt = require("bcryptjs");

const { DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME, DEMO_ACCOUNT_ID } = require("./demoConstants");

const EXPENSE_CATEGORIES = [
  "Clothing",
  "Hobbies",
  "Eating out",
  "Food order",
  "Cosmetics",
  "Drugstore",
  "Presents",
  "Mobility",
  "Special",
  "Health",
  "Interior",
  "Misc"
];
const INCOME_CATEGORIES = ["Salary 1", "Salary 2", "Child benefit", "Misc Income"];
const SAVINGS_CATEGORY = "Savings";

/** Typische monatliche Ausgabe je Kategorie in Euro (Basiswert vor Streuung). */
const EXPENSE_BASE_EUR = {
  Clothing: 80,
  Hobbies: 60,
  "Eating out": 140,
  "Food order": 70,
  Cosmetics: 35,
  Drugstore: 40,
  Presents: 45,
  Mobility: 95,
  Special: 50,
  Health: 30,
  Interior: 55,
  Misc: 25
};

/** Anzahl der zu generierenden Monate (inkl. aktuellem Monat). */
const MONTHS_BACK = 36;

/** Einfacher deterministischer PRNG (LCG) — gleicher Seed → gleiche Folge. */
function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Streut einen Basisbetrag um +/- `pct` und gibt gerundete Cents zurück. */
function variedCents(rng, baseEur, pct) {
  const delta = (rng() * 2 - 1) * pct;
  return Math.round(baseEur * (1 + delta) * 100);
}

/** Ganzzahl im Bereich [min, max]. */
function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

async function ensureUserAndAccount(prisma) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { password: passwordHash, name: DEMO_NAME },
    create: { email: DEMO_EMAIL, name: DEMO_NAME, password: passwordHash }
  });

  const account = await prisma.account.upsert({
    where: { id: DEMO_ACCOUNT_ID },
    update: { userId: user.id },
    create: { id: DEMO_ACCOUNT_ID, name: "Demo Account", userId: user.id }
  });

  const categoryMap = {};
  for (const name of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, SAVINGS_CATEGORY]) {
    const isIncome = INCOME_CATEGORIES.includes(name);
    const cat = await prisma.category.upsert({
      where: { userId_name: { userId: user.id, name } },
      update: { isIncome },
      create: { name, isIncome, userId: user.id }
    });
    categoryMap[name] = cat.id;
  }

  return { user, account, categoryMap };
}

/** Löscht alle generierten Demo-Daten des Accounts (für die Neugenerierung). */
async function clearAccountData(prisma, accountId) {
  // Transaktionen zuerst (referenzieren Budgets via savingGoalId / Kategorien).
  await prisma.transaction.deleteMany({ where: { accountId } });
  await prisma.budget.deleteMany({ where: { accountId } });
  // Recurring-Skips hängen per onDelete: Cascade an RecurringTransaction.
  await prisma.recurringTransaction.deleteMany({ where: { accountId } });
}

/** Baut alle Transaktions-Datensätze für die letzten MONTHS_BACK Monate. */
function buildTransactions(accountId, categoryMap, now) {
  const transactions = [];

  for (let k = MONTHS_BACK - 1; k >= 0; k--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - k, 1, 12, 0, 0);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth(); // 0-basiert
    const isCurrentMonth = k === 0;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const maxDay = isCurrentMonth ? now.getDate() : lastDay;

    // Pro Monat ein eigener, deterministischer Zufallsstrom.
    const rng = makeRng((year * 100 + month + 1) >>> 0);

    const addTx = (name, amountCents, day, label) => {
      const safeDay = Math.min(Math.max(day, 1), maxDay);
      if (safeDay < 1) return;
      transactions.push({
        accountId,
        categoryId: categoryMap[name],
        amountCents,
        description: label,
        occurredAt: new Date(year, month, safeDay, 12, 0, 0)
      });
    };

    // --- Einnahmen ---
    if (maxDay >= 1) addTx("Salary 1", variedCents(rng, 2500, 0.04), 1, "Salary 1 income");
    if (maxDay >= 1) addTx("Salary 2", variedCents(rng, 1500, 0.05), 1, "Salary 2 income");
    if (maxDay >= 18) addTx("Child benefit", 25000, 18, "Child benefit");
    if (rng() < 0.3) {
      const day = randInt(rng, 1, maxDay);
      addTx("Misc Income", variedCents(rng, 150, 0.6), day, "Misc income");
    }

    // --- Ausgaben (je Kategorie eine Transaktion, gestreuter Tag) ---
    for (const name of EXPENSE_CATEGORIES) {
      const cents = variedCents(rng, EXPENSE_BASE_EUR[name], 0.35);
      const day = randInt(rng, 1, maxDay);
      addTx(name, -Math.abs(cents), day, `${name} expense`);
    }
    // Etwas häufigere Alltagsausgaben für realistischere Charts.
    for (const name of ["Eating out", "Food order"]) {
      if (rng() < 0.7) {
        const cents = variedCents(rng, EXPENSE_BASE_EUR[name] * 0.6, 0.4);
        const day = randInt(rng, 1, maxDay);
        addTx(name, -Math.abs(cents), day, `${name} expense`);
      }
    }

    // --- Spartransfer ---
    if (maxDay >= 28) {
      addTx(SAVINGS_CATEGORY, -Math.abs(variedCents(rng, 250, 0.4)), 28, "Monthly savings transfer");
    }
  }

  return transactions;
}

/** Erzeugt Budget-Einträge (geplante monatliche Sparrate) je Monat. */
function buildBudgets(accountId, now) {
  const budgets = [];
  for (let k = MONTHS_BACK - 1; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    budgets.push({
      accountId,
      categoryId: null,
      month: d.getMonth() + 1, // 1-basiert im Schema
      year: d.getFullYear(),
      amountCents: 60000
    });
  }
  return budgets;
}

/** Legt einige wiederkehrende Buchungen an (für Recurring-Feature & Projektionen). */
async function createRecurring(prisma, accountId, categoryMap, now) {
  const nextMonthFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12, 0, 0);
  const data = [
    {
      accountId,
      categoryId: categoryMap["Salary 1"],
      amountCents: 250000,
      description: "Salary 1",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 1,
      nextOccurrence: nextMonthFirst
    },
    {
      accountId,
      categoryId: categoryMap["Mobility"],
      amountCents: -9500,
      description: "Transit pass",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 5,
      nextOccurrence: new Date(now.getFullYear(), now.getMonth() + 1, 5, 12, 0, 0)
    },
    {
      accountId,
      categoryId: categoryMap[SAVINGS_CATEGORY],
      amountCents: -25000,
      description: "Monthly savings transfer",
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: 28,
      nextOccurrence: new Date(now.getFullYear(), now.getMonth() + 1, 28, 12, 0, 0)
    }
  ];
  for (const rec of data) {
    await prisma.recurringTransaction.create({ data: rec });
  }
}

/**
 * Stellt sicher, dass der Demo-User samt 36 Monaten Beispieldaten existiert.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @returns {Promise<{ refreshed: boolean }>}
 */
async function ensureDemoData(prisma) {
  const { account, categoryMap } = await ensureUserAndAccount(prisma);

  const now = new Date();
  const [latest, oldest] = await Promise.all([
    prisma.transaction.findFirst({
      where: { accountId: account.id },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true }
    }),
    prisma.transaction.findFirst({
      where: { accountId: account.id },
      orderBy: { occurredAt: "asc" },
      select: { occurredAt: true }
    })
  ]);

  // Daten gelten als vollständig & frisch, wenn die jüngste Transaktion im
  // aktuellen Monat liegt UND die älteste den vollen ~36-Monats-Zeitraum
  // abdeckt. So wird auch ein älterer Seed (nur aktueller Monat) erkannt und
  // auf 3 Jahre erweitert.
  if (latest && oldest) {
    const newest = latest.occurredAt;
    const isCurrentMonth =
      newest.getFullYear() === now.getFullYear() && newest.getMonth() === now.getMonth();
    const monthSpan =
      (now.getFullYear() - oldest.occurredAt.getFullYear()) * 12 +
      (now.getMonth() - oldest.occurredAt.getMonth());
    if (isCurrentMonth && monthSpan >= MONTHS_BACK - 2) {
      return { refreshed: false };
    }
    // Unvollständig oder veraltet → komplett neu generieren.
    await clearAccountData(prisma, account.id);
  }

  const transactions = buildTransactions(account.id, categoryMap, now);
  await prisma.transaction.createMany({ data: transactions });

  const budgets = buildBudgets(account.id, now);
  await prisma.budget.createMany({ data: budgets });

  await createRecurring(prisma, account.id, categoryMap, now);

  return { refreshed: true };
}

module.exports = { ensureDemoData };
