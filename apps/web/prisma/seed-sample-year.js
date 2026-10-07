/* eslint-env node */
/* eslint-disable no-console, @typescript-eslint/no-var-requires */
/**
 * Local dev seed: ONE sample user + household with realistic data for the whole
 * previous year (2025) and the current year up to "today" (2026-10-07).
 *
 *   npm --workspace @doewe/web run db:seed:sample
 *
 * Login (dev only, local database only):
 *   E-Mail:   sample@doewe.test
 *   Password: sample-pass-123
 *
 * - Idempotent: deletes and rebuilds ONLY the household of sample@doewe.test.
 * - Never touches the public demo account (demo@doewe.test, lib/demoData.js).
 * - Refuses to run when NODE_ENV === "production" or DATABASE_URL is not
 *   localhost / 127.0.0.1.
 * - Deterministic: seeded PRNG, so every run produces identical data.
 * - Recurring templates get one real Transaction per due month (same rule as
 *   lib/recurringBooking.ts), so the auto-booking cron never double-books.
 */
const fs = require("fs");
const path = require("path");

const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const SAMPLE_EMAIL = "sample@doewe.test";
const SAMPLE_PASSWORD = "sample-pass-123"; // dev-only, obviously not a real secret
const SAMPLE_NAME = "Anna & Markus (Beispiel)";

// Fixed "today" so the dataset matches the documented period.
const TODAY = new Date(2026, 9, 7); // 2026-10-07 local midnight
const START_YEAR = 2025;

/** Loads apps/web/.env into process.env if DATABASE_URL is not already set. */
function loadEnvFile() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function assertSafeEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed-sample-year: refusing to run with NODE_ENV=production.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("seed-sample-year: DATABASE_URL is not set.");
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("seed-sample-year: DATABASE_URL is not a valid URL.");
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `seed-sample-year: refusing to run, DATABASE_URL host "${host}" is not localhost/127.0.0.1.`
    );
  }
}

/** mulberry32 — small deterministic PRNG. */
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20260507);
const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1));
/** Random euro amount in [minEuro, maxEuro], returned as integer cents. */
const randCents = (minEuro, maxEuro) => randInt(minEuro * 100, maxEuro * 100 - 1);
const chance = (p) => rng() < p;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// Same due-month rule as packages/shared/src/recurringSchedule.ts (dueMonthsBetween).
function dueMonthsBetween({ nextYear, nextMonth, intervalMonths, untilYear, untilMonth }) {
  const total = (untilYear - nextYear) * 12 + (untilMonth - nextMonth);
  if (total < 0) return [];
  const result = [];
  for (let offset = 0; offset <= total; offset += intervalMonths || 1) {
    const abs = nextMonth - 1 + offset;
    result.push({ year: nextYear + Math.floor(abs / 12), month: (abs % 12) + 1 });
  }
  return result;
}

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

/** All months from START_YEAR-01 up to and including TODAY's month. */
function allMonths() {
  const months = [];
  for (let y = START_YEAR; y <= TODAY.getFullYear(); y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === TODAY.getFullYear() && m > TODAY.getMonth() + 1) break;
      months.push({ year: y, month: m });
    }
  }
  return months;
}

const CATEGORIES = [
  { name: "Gehalt Anna", isIncome: true, isTaxRelevant: true },
  { name: "Gehalt Markus", isIncome: true, isTaxRelevant: true },
  { name: "Kindergeld", isIncome: true },
  { name: "Miete" },
  { name: "Strom & Gas" },
  { name: "Internet & Mobilfunk" },
  { name: "Versicherungen", isTaxRelevant: true },
  { name: "KFZ" },
  { name: "Kita", isTaxRelevant: true },
  { name: "Lebensmittel" },
  { name: "Restaurants" },
  { name: "Freizeit" },
  { name: "Kleidung" },
  { name: "Gesundheit", isTaxRelevant: true },
  { name: "Geschenke" },
  { name: "Urlaub" },
  { name: "Abos" },
  { name: "Haushalt" },
  { name: "Sonstiges" },
  // Recognised as the savings pool by SAVINGS_CATEGORY_NAMES (api/saving-plan/savings.ts).
  { name: "Sparen" }
];

// anchor = first due date (2025); amounts in cents, expenses negative.
const RECURRING = [
  { desc: "Gehalt Anna", cat: "Gehalt Anna", cents: 160000, interval: 1, day: 28, anchor: [2025, 1] },
  { desc: "Gehalt Markus", cat: "Gehalt Markus", cents: 210000, interval: 1, day: 30, anchor: [2025, 1] },
  { desc: "Kindergeld", cat: "Kindergeld", cents: 25500, interval: 1, day: 3, anchor: [2025, 1] },
  { desc: "Miete", cat: "Miete", cents: -125000, interval: 1, day: 1, anchor: [2025, 1] },
  { desc: "Kita-Beitrag", cat: "Kita", cents: -38000, interval: 1, day: 5, anchor: [2025, 1] },
  { desc: "Internet & Mobilfunk", cat: "Internet & Mobilfunk", cents: -6000, interval: 1, day: 8, anchor: [2025, 1] },
  { desc: "Spotify", cat: "Abos", cents: -1199, interval: 1, day: 12, anchor: [2025, 1] },
  { desc: "Netflix", cat: "Abos", cents: -1399, interval: 1, day: 14, anchor: [2025, 1] },
  { desc: "Sparrate", cat: "Sparen", cents: -30000, interval: 1, day: 2, anchor: [2025, 1] },
  { desc: "Strom- und Gasabschlag", cat: "Strom & Gas", cents: -26000, interval: 2, day: 15, anchor: [2025, 2] },
  { desc: "Haftpflichtversicherung", cat: "Versicherungen", cents: -4500, interval: 3, day: 10, anchor: [2025, 3] },
  { desc: "KFZ-Versicherung", cat: "KFZ", cents: -42000, interval: 6, day: 5, anchor: [2025, 1] },
  { desc: "KFZ-Steuer", cat: "KFZ", cents: -18000, interval: 12, day: 12, anchor: [2025, 4] },
  { desc: "Jahres-Abo Prime", cat: "Abos", cents: -8990, interval: 12, day: 20, anchor: [2025, 9] },
  { desc: "Hausratversicherung", cat: "Versicherungen", cents: -18000, interval: 12, day: 15, anchor: [2025, 1] }
];

// Months a due occurrence is skipped on purpose (no booking, RecurringTransactionSkip row).
const SKIPS = [
  { desc: "Netflix", year: 2025, month: 5 },
  { desc: "Kita-Beitrag", year: 2025, month: 8 }
];

const BUDGET_PLANS = [
  { cat: "Lebensmittel", period: "MONTHLY", cents: 70000 },
  { cat: "Restaurants", period: "MONTHLY", cents: 12000 },
  { cat: "Freizeit", period: "MONTHLY", cents: 15000 },
  { cat: "Kleidung", period: "MONTHLY", cents: 8000 },
  { cat: "Urlaub", period: "YEARLY", cents: 240000 },
  { cat: "Geschenke", period: "YEARLY", cents: 60000 },
  { cat: "Haushalt", period: "YEARLY", cents: 50000 }
];

// Legacy per-month Budget rows for categories WITHOUT a plan.
const LEGACY_BUDGETS = [
  { cat: "Gesundheit", year: 2026, month: 10, cents: 5000 },
  { cat: "Sonstiges", year: 2026, month: 10, cents: 8000 }
];

// Months where a category deliberately exceeds its budget.
const FOOD_OVERSPEND = new Set(["2025-12", "2026-03"]);

/** Variable everyday expenses for one month; only days up to `lastDay` (today cut-off). */
function variableExpensesForMonth(year, month, lastDay) {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const out = [];
  const add = (day, cat, cents, description) => {
    if (day > lastDay) return;
    out.push({ day, cat, cents: -cents, description });
  };
  const dim = daysInMonth(year, month);

  // Groceries: 2-3 trips per week, 15-90 EUR (bigger shops in overspend months).
  const foodShops = ["REWE", "Edeka", "Lidl", "Aldi", "dm Drogerie", "Bäckerei"];
  const foodBoost = FOOD_OVERSPEND.has(key) ? 1.45 : 1;
  for (let day = 1; day <= dim; day++) {
    const weekday = new Date(year, month - 1, day).getDay();
    if (chance(weekday === 6 ? 0.85 : 0.33)) {
      add(day, "Lebensmittel", Math.round(randCents(15, 90) * foodBoost), pick(foodShops));
    }
  }

  // Restaurants: 2-4 visits.
  for (let i = 0, n = randInt(2, 4); i < n; i++) {
    add(randInt(1, dim), "Restaurants", randCents(14, 42), pick(["Pizzeria", "Burger Laden", "Café", "Asia Imbiss", "Brunch"]));
  }
  // Freizeit: 1-3 activities.
  for (let i = 0, n = randInt(1, 3); i < n; i++) {
    add(randInt(1, dim), "Freizeit", randCents(8, 50), pick(["Kino", "Schwimmbad", "Zoo", "Bowling", "Spielplatz-Eis", "Konzert"]));
  }
  // Kleidung: roughly every second month.
  if (chance(0.5)) add(randInt(1, dim), "Kleidung", randCents(20, 70), pick(["H&M", "Zalando", "Kinderkleidung", "Schuhe"]));
  // Gesundheit: occasional.
  if (chance(0.3)) add(randInt(1, dim), "Gesundheit", randCents(8, 40), pick(["Apotheke", "Zuzahlung Arzt", "Brille Reinigung"]));
  // Haushalt: most months.
  if (chance(0.65)) add(randInt(1, dim), "Haushalt", randCents(10, 50), pick(["Baumarkt", "Ikea", "Putzmittel", "Kleinteile"]));
  // Sonstiges: half of the months.
  if (chance(0.5)) add(randInt(1, dim), "Sonstiges", randCents(5, 35), pick(["Porto", "Kopierladen", "Parkgebühr", "Spende"]));

  // Geschenke: birthdays in March and June, Christmas shopping in December (over plan).
  if (month === 3) add(14, "Geschenke", randCents(25, 45), "Geburtstagsgeschenk");
  if (month === 6) add(21, "Geschenke", randCents(25, 45), "Geburtstagsgeschenk");
  if (month === 12) {
    add(6, "Geschenke", randCents(90, 140), "Weihnachtsgeschenke Familie");
    add(12, "Geschenke", randCents(110, 160), "Weihnachtsgeschenke Kinder");
    add(18, "Geschenke", randCents(90, 150), "Weihnachtsgeschenke Freunde");
    add(21, "Geschenke", randCents(130, 200), "Weihnachtsgeschenke Verwandtschaft");
  }

  // Urlaub: summer trips (above the 2.400 EUR yearly plan in sum).
  if (month === 6) add(10, "Urlaub", randCents(1050, 1250), "Flüge Sommerurlaub");
  if (month === 7) add(8, "Urlaub", randCents(1250, 1450), "Unterkunft Sommerurlaub");
  if (month === 8) {
    add(4, "Urlaub", randCents(260, 340), "Mietwagen");
    add(9, "Urlaub", randCents(330, 420), "Essen & Ausflüge");
  }
  return out;
}

async function deleteSampleHousehold(prisma, userId, householdId) {
  const accounts = await prisma.account.findMany({ where: { householdId }, select: { id: true } });
  const accountIds = accounts.map((a) => a.id);
  const budgets = await prisma.budget.findMany({ where: { accountId: { in: accountIds } }, select: { id: true } });

  await prisma.budgetAlertLog.deleteMany({ where: { budgetId: { in: budgets.map((b) => b.id) } } });
  await prisma.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
  await prisma.budget.deleteMany({ where: { accountId: { in: accountIds } } });
  await prisma.recurringTransaction.deleteMany({ where: { accountId: { in: accountIds } } }); // skips cascade
  await prisma.account.deleteMany({ where: { householdId } });
  await prisma.category.deleteMany({ where: { householdId } }); // plans cascade
  await prisma.householdMember.deleteMany({ where: { householdId } });
  await prisma.household.delete({ where: { id: householdId } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
}

async function main() {
  loadEnvFile();
  assertSafeEnvironment();
  const prisma = new PrismaClient();

  try {
    // 1) Remove any previous sample data (only this user's household).
    const existing = await prisma.user.findUnique({
      where: { email: SAMPLE_EMAIL },
      include: { householdMember: true }
    });
    if (existing) {
      const householdId = existing.householdMember?.householdId;
      if (householdId) await deleteSampleHousehold(prisma, existing.id, householdId);
      else await prisma.user.delete({ where: { id: existing.id } });
    }

    // 2) User + household (OWNER) + account, mirroring createUserWithDefaults.
    const household = await prisma.household.create({ data: { name: "Haushalt Beispiel" } });
    const user = await prisma.user.create({
      data: {
        email: SAMPLE_EMAIL,
        name: SAMPLE_NAME,
        password: await hash(SAMPLE_PASSWORD, 10), // bcryptjs, cost 10 — same as auth/register
        householdMember: { create: { householdId: household.id, role: "OWNER" } },
        accounts: { create: { name: "Girokonto", householdId: household.id } }
      },
      include: { accounts: { select: { id: true } } }
    });
    const accountId = user.accounts[0].id;

    await prisma.category.createMany({
      data: CATEGORIES.map((c) => ({
        name: c.name,
        isIncome: c.isIncome ?? false,
        isTaxRelevant: c.isTaxRelevant ?? false,
        userId: user.id,
        householdId: household.id
      }))
    });
    const categoryRows = await prisma.category.findMany({ where: { householdId: household.id } });
    const catId = (name) => categoryRows.find((c) => c.name === name).id;

    // 3) Recurring templates + one real booking per due month (<= today, not skipped).
    const txRows = [];
    const templates = {};
    const monthKey = (y, m) => `${y}-${m}`;
    const skipSet = new Set(SKIPS.map((s) => `${s.desc}|${monthKey(s.year, s.month)}`));
    const expectedBookings = {};
    let skipCount = 0;

    for (const r of RECURRING) {
      const [ay, am] = r.anchor;
      const anchorDay = Math.min(r.day, daysInMonth(ay, am));
      const tpl = await prisma.recurringTransaction.create({
        data: {
          accountId,
          categoryId: catId(r.cat),
          amountCents: r.cents,
          description: r.desc,
          frequency: "MONTHLY", // same as the API: cadence lives in intervalMonths
          intervalMonths: r.interval,
          dayOfMonth: r.day,
          nextOccurrence: new Date(ay, am - 1, anchorDay)
        }
      });
      templates[r.desc] = tpl.id;
      expectedBookings[r.desc] = 0;

      const due = dueMonthsBetween({
        nextYear: ay,
        nextMonth: am,
        intervalMonths: r.interval,
        untilYear: TODAY.getFullYear(),
        untilMonth: TODAY.getMonth() + 1
      });
      for (const { year, month } of due) {
        const occurredAt = new Date(year, month - 1, Math.min(r.day, daysInMonth(year, month)));
        if (occurredAt.getTime() > TODAY.getTime()) continue;
        if (skipSet.has(`${r.desc}|${monthKey(year, month)}`)) {
          await prisma.recurringTransactionSkip.create({ data: { recurringId: tpl.id, year, month } });
          skipCount++;
          continue;
        }
        expectedBookings[r.desc]++;
        txRows.push({
          accountId,
          categoryId: catId(r.cat),
          amountCents: r.cents,
          description: r.desc,
          occurredAt,
          recurringTransactionId: tpl.id,
          createdByUserId: user.id,
          taxRelevant: CATEGORIES.find((c) => c.name === r.cat).isTaxRelevant === true
        });
      }
    }

    // 4) Opening balance (carry-over into 2025) and two savings withdrawals.
    const manual = (date, cat, cents, description) =>
      txRows.push({
        accountId,
        categoryId: cat ? catId(cat) : null,
        amountCents: cents,
        description,
        occurredAt: date,
        createdByUserId: user.id
      });
    manual(new Date(2024, 11, 31), null, 250000, "Anfangsbestand Girokonto");
    manual(new Date(2025, 11, 2), "Sparen", 80000, "Entnahme Weihnachtsgeld-Topf");
    manual(new Date(2026, 5, 15), "Sparen", 150000, "Entnahme Urlaubskasse");

    // 5) Variable everyday expenses for every month up to today.
    for (const { year, month } of allMonths()) {
      const isCurrent = year === TODAY.getFullYear() && month === TODAY.getMonth() + 1;
      const lastDay = isCurrent ? TODAY.getDate() : daysInMonth(year, month);
      for (const e of variableExpensesForMonth(year, month, lastDay)) {
        txRows.push({
          accountId,
          categoryId: catId(e.cat),
          amountCents: e.cents,
          description: e.description,
          occurredAt: new Date(year, month - 1, e.day),
          createdByUserId: user.id,
          taxRelevant: e.cat === "Gesundheit"
        });
      }
    }

    await prisma.transaction.createMany({ data: txRows });

    // 6) Budget plans, legacy budgets, saving goals.
    await prisma.categoryBudgetPlan.createMany({
      data: BUDGET_PLANS.map((p) => ({
        householdId: household.id,
        categoryId: catId(p.cat),
        period: p.period,
        amountCents: p.cents
      }))
    });
    await prisma.budget.createMany({
      data: LEGACY_BUDGETS.map((b) => ({
        accountId,
        categoryId: catId(b.cat),
        title: "",
        month: b.month,
        year: b.year,
        amountCents: b.cents
      }))
    });
    await prisma.budget.createMany({
      data: [
        { accountId, title: "Neue Waschmaschine", amountCents: 70000, month: 12, year: 2026 },
        { accountId, title: "Fahrräder für die Kinder", amountCents: 120000 }
      ]
    });

    console.log("Sample data created.");
    console.log(`  Period:            2025-01-01 .. ${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-${String(TODAY.getDate()).padStart(2, "0")}`);
    console.log(`  Transactions:      ${txRows.length}`);
    console.log(`  Recurring:         ${RECURRING.length} (skipped occurrences: ${skipCount})`);
    console.log(`  Budget plans:      ${BUDGET_PLANS.length} (+ ${LEGACY_BUDGETS.length} legacy budgets, 2 saving goals)`);
    console.log(`Login: ${SAMPLE_EMAIL} (password: see header of prisma/seed-sample-year.js)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
