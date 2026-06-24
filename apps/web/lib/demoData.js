/**
 * Generiert deterministische, *realistische* Demo-Daten über die letzten
 * {@link MONTHS_BACK} Monate für den geteilten Demo-Account.
 *
 * Das Szenario bildet das Finanzleben einer vierköpfigen Familie nach
 * (zwei Erwachsene „Markus" & „Anna", zwei Kinder „Lena" & „Jonas"):
 *  - zwei Gehälter (eines mit Gehaltssprung), Kindergeld, Weihnachts-/Urlaubsgeld
 *    und eine jährliche Steuererstattung,
 *  - feste Lebenshaltungskosten (Miete, Strom, Versicherungen, Abos, Kita …)
 *    als echte historische Buchungen UND als Daueraufträge für die Projektion,
 *  - variable Alltagsausgaben mit realistischer Häufigkeit und echten
 *    Händlernamen (REWE, Aral, Lieferando …),
 *  - saisonale Muster (Weihnachten, Sommerurlaub, Einschulung, Heizkosten),
 *  - einmalige Lebensereignisse (Waschmaschine, Autoreparatur, Sofa …),
 *  - eine monatliche Sparrate plus benannte Sparziele (aktiv & abgeschlossen).
 *
 * Wird sowohl vom Seed-Skript (`prisma/seed.js`) als auch von der öffentlichen
 * Demo-Route (`app/api/demo/seed`) verwendet, damit lokale Entwicklung und
 * Produktion exakt dieselben Daten erzeugen. Erhält die `PrismaClient`-Instanz
 * als Argument (kein eigener Import), damit das Modul laufzeit-agnostisch bleibt.
 *
 * Eigenschaften:
 * - Idempotent: bereits aktuelle Daten werden nicht dupliziert.
 * - Selbst-auffrischend: liegen die jüngsten Daten vor dem aktuellen Monat,
 *   werden die Demo-Daten gelöscht und neu generiert.
 * - Versioniert: {@link DEMO_DATA_VERSION} / {@link VERSION_PROBE_CATEGORY}.
 *   Ändert sich der Datensatz-Aufbau, erkennt der Generator vorhandene
 *   ältere Demo-Daten (denen die Sonde-Kategorie fehlt) und generiert neu —
 *   so übernimmt auch eine bestehende Live-Demo die neue Fassung automatisch.
 * - Deterministisch über einen Seeded-PRNG → stabile, reproduzierbare Demo.
 */
const bcrypt = require("bcryptjs");

const { DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME, DEMO_ACCOUNT_ID } = require("./demoConstants");

/** Anzahl der zu generierenden Monate (inkl. aktuellem Monat). */
const MONTHS_BACK = 36;

/**
 * Version des generierten Datensatzes. Bei strukturellen Änderungen erhöhen
 * UND ggf. {@link VERSION_PROBE_CATEGORY} anpassen, damit bestehende
 * Demo-Datenbanken beim nächsten Seed-Lauf neu generiert werden.
 */
const DEMO_DATA_VERSION = 2;

/**
 * Kategorie, die ausschließlich diese Datensatz-Version anlegt. Fehlt sie im
 * vorhandenen Demo-Account, gelten die Daten als veraltet und werden ersetzt.
 */
const VERSION_PROBE_CATEGORY = "Groceries";

const INCOME_CATEGORIES = ["Salary 1", "Salary 2", "Child benefit", "Bonus", "Tax refund", "Misc Income"];

const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Insurance",
  "Subscriptions",
  "Groceries",
  "Eating out",
  "Food order",
  "Mobility",
  "Childcare",
  "Kids",
  "Clothing",
  "Health",
  "Hobbies",
  "Household",
  "Presents",
  "Travel",
  "Misc"
];

const SAVINGS_CATEGORY = "Savings";

/** Vollständige Kategorienliste — auch für das Aufräumen veralteter Kategorien. */
const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, SAVINGS_CATEGORY];

/** Realistische Händler-/Buchungstexte je variabler Kategorie. */
const MERCHANTS = {
  Groceries: ["REWE", "EDEKA", "ALDI SÜD", "Lidl", "Kaufland", "Penny", "NETTO Markt"],
  "Eating out": ["Restaurant La Piazza", "Café Milchbar", "Bäckerei Köhler", "Vapiano", "Eiscafé Venezia", "Asia Wok", "Pizzeria Roma"],
  "Food order": ["Lieferando", "Domino's Pizza", "Burger King", "Sushi Circle", "Wolt"],
  Mobility: ["Shell", "Aral", "ESSO", "JET Tankstelle", "Parkhaus City", "DB Fernverkehr", "Total Energies"],
  Clothing: ["H&M", "C&A", "Zalando", "Deichmann", "Zara", "Decathlon", "Engelbert Strauss"],
  Kids: ["Spielwaren Müller", "dm Baby", "Kinderschuhe Tausendfüßler", "JAKO-O", "Buchhandlung Lesezeit"],
  Health: ["Apotheke am Markt", "Sanitätshaus Reha", "Heilpraktiker", "Physiotherapie"],
  Hobbies: ["Thalia Buchhandlung", "SportScheck", "Kletterhalle", "OBI Baumarkt", "Steam Games", "Musikladen"],
  Household: ["IKEA", "Amazon", "Tedi", "Rossmann", "Nanu-Nana", "dm-drogerie", "MediaMarkt"],
  Presents: ["Amazon Geschenk", "Parfümerie Douglas", "Spielwaren Müller", "Blumen Müller", "Thalia"],
  "Misc Income": ["Kleinanzeigen Verkauf", "Pfandrückgabe", "Rückerstattung", "Geldgeschenk", "Bonusprogramm"]
};

/**
 * Einmalige Lebensereignisse, verankert über den Monatsabstand `k` (0 = aktueller
 * Monat). Erzeugen markante Ausschläge in der Monatsrückschau / Top-Ausgaben.
 */
const ONE_OFF_EVENTS = [
  { k: 33, cat: "Household", cents: 62000, label: "Waschmaschine (Bosch)" },
  { k: 28, cat: "Mobility", cents: 85000, label: "KFZ-Werkstatt Reparatur" },
  { k: 22, cat: "Household", cents: 92000, label: "Smartphone (Saturn)" },
  { k: 15, cat: "Household", cents: 110000, label: "Laptop fürs Homeoffice" },
  { k: 11, cat: "Health", cents: 48000, label: "Zahnarzt Zahnersatz" },
  { k: 8, cat: "Household", cents: 130000, label: "Neues Sofa (XXXLutz)" },
  { k: 5, cat: "Kids", cents: 35000, label: "Kinderfahrrad" },
  { k: 2, cat: "Health", cents: 32000, label: "Optiker neue Brille" }
];

/** Abgeschlossene Sparziele (für die Historie), verankert über Monatsabstand `k`. */
const COMPLETED_GOAL_SPECS = [
  { k: 33, amountCents: 60000, spentCents: 62000, title: "Neue Waschmaschine" },
  { k: 21, amountCents: 300000, spentCents: 309000, title: "Sommerurlaub" },
  { k: 15, amountCents: 100000, spentCents: 108000, title: "Laptop fürs Homeoffice" },
  { k: 8, amountCents: 130000, spentCents: 127000, title: "Neues Sofa" }
];

/** Kategorie-Budgets (Plan vs. Ist) für aktuellen + letzte Monate. */
const CATEGORY_BUDGETS = [
  ["Groceries", 80000],
  ["Eating out", 15000],
  ["Mobility", 20000],
  ["Clothing", 12000],
  ["Kids", 12000],
  ["Hobbies", 9000],
  ["Household", 10000]
];

/** Daueraufträge (laufende Lebenshaltung) — Beträge in Cents (Ausgaben negativ). */
const RECURRING_ITEMS = [
  { cat: "Salary 1", cents: 350000, day: 1, desc: "Gehalt (Markus)" },
  { cat: "Salary 2", cents: 160000, day: 1, desc: "Gehalt (Anna)" },
  { cat: "Child benefit", cents: 50000, day: 18, desc: "Kindergeld" },
  { cat: "Rent", cents: -149500, day: 1, desc: "Miete" },
  { cat: "Utilities", cents: -12000, day: 5, desc: "Stadtwerke Strom & Gas" },
  { cat: "Insurance", cents: -16500, day: 3, desc: "Versicherungen (Haftpflicht, Hausrat, KFZ)" },
  { cat: "Subscriptions", cents: -4500, day: 15, desc: "Telekom Internet" },
  { cat: "Subscriptions", cents: -5500, day: 15, desc: "Mobilfunk (2 Verträge)" },
  { cat: "Subscriptions", cents: -3800, day: 10, desc: "Streaming-Abos" },
  { cat: "Childcare", cents: -18000, day: 1, desc: "Kita-Beitrag" },
  { cat: "Kids", cents: -6500, day: 5, desc: "Musikschule & Sportverein" },
  { cat: "Hobbies", cents: -4200, day: 1, desc: "Fitnessstudio" },
  { cat: "Mobility", cents: -5800, day: 1, desc: "Deutschlandticket" },
  { cat: "Savings", cents: -40000, day: 28, desc: "Übertrag Tagesgeldkonto" }
];

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

/** Wählt deterministisch ein Element aus `arr`. */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
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
  for (const name of ALL_CATEGORIES) {
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

/** Entfernt Kategorien des Demo-Users, die nicht (mehr) zum Datensatz gehören. */
async function deleteStaleCategories(prisma, userId) {
  await prisma.category.deleteMany({ where: { userId, name: { notIn: ALL_CATEGORIES } } });
}

/**
 * Baut alle Transaktions-Datensätze für die letzten MONTHS_BACK Monate.
 * Jeder Monat erhält einen eigenen, deterministischen Zufallsstrom.
 */
function buildTransactions(accountId, categoryMap, now) {
  const transactions = [];
  const today = now.getDate();

  for (let k = MONTHS_BACK - 1; k >= 0; k--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - k, 1, 12, 0, 0);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth(); // 0-basiert
    const month1 = month + 1; // 1-basiert
    const isCurrentMonth = k === 0;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const maxDay = isCurrentMonth ? today : lastDay;
    // Anteil des bereits verstrichenen Monats — skaliert variable Buchungszahlen
    // im laufenden Monat, damit nicht ein voller Monat auf Tag 3 gebucht wirkt.
    const progress = isCurrentMonth ? Math.max(maxDay / lastDay, 0) : 1;
    // 0 = ältester Monat … (MONTHS_BACK-1) = aktueller Monat (für Gehaltssprünge).
    const monthsFromStart = MONTHS_BACK - 1 - k;

    const rng = makeRng((year * 100 + month1) >>> 0);

    // Bucht nur, wenn der Tag im erfassten Zeitraum liegt (laufender Monat: bis heute).
    const addTx = (name, amountCents, day, label) => {
      if (day < 1 || day > maxDay) return;
      transactions.push({
        accountId,
        categoryId: categoryMap[name] ?? null,
        amountCents,
        description: label,
        occurredAt: new Date(year, month, day, 12, 0, 0)
      });
    };

    // Skalierte Anzahl variabler Buchungen (mind. 0).
    const scaled = (base) => Math.max(0, Math.round(base * progress));
    // Mehrere Buchungen einer variablen Kategorie streuen.
    const addVaried = (name, count, baseEur, spread) => {
      const merchants = MERCHANTS[name] || [name];
      for (let i = 0; i < count; i++) {
        addTx(name, -Math.abs(variedCents(rng, baseEur, spread)), randInt(rng, 1, maxDay), pick(rng, merchants));
      }
    };

    // ── Einnahmen ────────────────────────────────────────────────
    const salary1 = monthsFromStart >= 20 ? 3500 : 3200; // Gehaltssprung Markus
    const salary2 = monthsFromStart >= 26 ? 1600 : 1450; // Gehaltssprung Anna
    addTx("Salary 1", variedCents(rng, salary1, 0.01), 1, "Gehalt (Markus)");
    addTx("Salary 2", variedCents(rng, salary2, 0.01), 1, "Gehalt (Anna)");
    addTx("Child benefit", 50000, 18, "Kindergeld");
    if (month === 10) addTx("Bonus", variedCents(rng, 1800, 0.05), 28, "Weihnachtsgeld");
    if (month === 5) addTx("Bonus", variedCents(rng, 1000, 0.05), 1, "Urlaubsgeld");
    if (month === 4) addTx("Tax refund", variedCents(rng, 1400, 0.2), randInt(rng, 8, 20), "Finanzamt Steuererstattung");
    if (rng() < 0.25) addTx("Misc Income", variedCents(rng, 90, 0.6), randInt(rng, 1, maxDay), pick(rng, MERCHANTS["Misc Income"]));

    // ── Feste Lebenshaltungskosten ───────────────────────────────
    const rent = monthsFromStart >= 24 ? 149500 : 145000; // Mieterhöhung
    addTx("Rent", -rent, 1, "Miete");
    // Strom/Gas saisonal: Winter teurer, Sommer günstiger.
    let utilBase = 110;
    if ([10, 11, 0, 1].includes(month)) utilBase = 145;
    else if ([5, 6, 7].includes(month)) utilBase = 95;
    addTx("Utilities", -Math.abs(variedCents(rng, utilBase, 0.08)), 5, "Stadtwerke Strom & Gas");
    addTx("Insurance", -16500, 3, "Versicherungen (Haftpflicht, Hausrat, KFZ)");
    addTx("Subscriptions", -4500, 15, "Telekom Internet");
    addTx("Subscriptions", -5500, 15, "Mobilfunk (2 Verträge)");
    addTx("Subscriptions", -Math.abs(variedCents(rng, 38, 0.05)), 10, pick(rng, ["Netflix & Spotify", "Disney+ & Spotify", "Streaming-Abos"]));
    addTx("Childcare", -18000, 1, "Kita-Beitrag");
    addTx("Kids", -6500, 5, pick(rng, ["Musikschule", "Sportverein Kinder", "Schwimmkurs"]));
    addTx("Hobbies", -4200, 1, "Fitnessstudio");
    addTx("Mobility", -5800, 1, "Deutschlandticket");

    // ── Variable Alltagsausgaben ─────────────────────────────────
    addVaried("Groceries", scaled(10), 76, 0.45);
    addVaried("Eating out", scaled(3), 34, 0.5);
    addVaried("Food order", scaled(2), 28, 0.35);
    addVaried("Mobility", scaled(3), 64, 0.3);
    addVaried("Kids", scaled(2), 32, 0.6);
    if (rng() < 0.7 * progress) addVaried("Health", 1, 24, 0.7);
    if (rng() < 0.7 * progress) addVaried("Hobbies", 1, 30, 0.6);
    if (rng() < 0.6 * progress) addVaried("Household", 1, 40, 0.7);
    if (rng() < 0.5 * progress) addVaried("Misc", 1, 25, 0.7);
    // Kleidung saisonal: Frühjahr/Herbst stärker.
    const clothingCount = [2, 3, 8, 9].includes(month) ? scaled(2) : rng() < 0.5 * progress ? 1 : 0;
    addVaried("Clothing", clothingCount, 55, 0.6);

    // ── Saisonale Muster ─────────────────────────────────────────
    if (month === 11) {
      // Dezember: Weihnachten
      addTx("Presents", -Math.abs(variedCents(rng, 420, 0.25)), randInt(rng, 8, Math.min(23, maxDay)), "Weihnachtsgeschenke");
      addTx("Eating out", -Math.abs(variedCents(rng, 45, 0.4)), randInt(rng, 1, maxDay), "Weihnachtsmarkt");
      addTx("Groceries", -Math.abs(variedCents(rng, 95, 0.3)), randInt(rng, 18, Math.min(24, maxDay)), "Festtagseinkauf");
    }
    if (month === 3) addTx("Presents", -Math.abs(variedCents(rng, 45, 0.4)), randInt(rng, 1, maxDay), "Ostergeschenke");
    if (month === 8) addTx("Kids", -Math.abs(variedCents(rng, 150, 0.3)), randInt(rng, 1, Math.min(15, maxDay)), "Schulbedarf & Schulranzen");
    if (month === 1 && rng() < 0.6) addTx("Utilities", -Math.abs(variedCents(rng, 160, 0.3)), randInt(rng, 5, 15), "Stromabrechnung Nachzahlung");
    if (month === 1 && rng() < 0.5) {
      // Gelegentlicher Winterurlaub
      addTx("Travel", -Math.abs(variedCents(rng, 1200, 0.25)), randInt(rng, 1, Math.min(20, maxDay)), "Winterurlaub Skifreizeit");
    }
    if (month === 7) {
      // August: großer Sommerurlaub
      addTx("Travel", -Math.abs(variedCents(rng, 2900, 0.2)), randInt(rng, 1, Math.min(18, maxDay)), pick(rng, ["Pauschalreise Mallorca", "Ferienhaus Nordsee", "Sommerurlaub Italien", "Cluburlaub Österreich"]));
      addVaried("Eating out", scaled(2), 38, 0.4);
    }

    // ── Geburtstage in der Familie ───────────────────────────────
    if (month === 2) {
      // Markus
      addTx("Presents", -Math.abs(variedCents(rng, 60, 0.4)), randInt(rng, 1, maxDay), "Geburtstagsgeschenk");
      addTx("Eating out", -Math.abs(variedCents(rng, 70, 0.4)), randInt(rng, 1, maxDay), "Geburtstagsessen");
    }
    if (month === 4) {
      // Lena
      addTx("Presents", -Math.abs(variedCents(rng, 55, 0.4)), randInt(rng, 1, maxDay), "Geburtstag Lena");
      addTx("Kids", -Math.abs(variedCents(rng, 50, 0.4)), randInt(rng, 1, maxDay), "Kindergeburtstag");
    }
    if (month === 8) {
      // Anna
      addTx("Presents", -Math.abs(variedCents(rng, 60, 0.4)), randInt(rng, 1, maxDay), "Geburtstag Anna");
      addTx("Eating out", -Math.abs(variedCents(rng, 75, 0.4)), randInt(rng, 1, maxDay), "Geburtstagsessen");
    }
    if (month === 10) {
      // Jonas
      addTx("Presents", -Math.abs(variedCents(rng, 50, 0.4)), randInt(rng, 1, maxDay), "Geburtstag Jonas");
    }

    // ── Einmalige Lebensereignisse ───────────────────────────────
    const event = ONE_OFF_EVENTS.find((e) => e.k === k);
    if (event) {
      addTx(event.cat, -Math.abs(event.cents), randInt(rng, 8, Math.min(22, maxDay)), event.label);
    }

    // ── Monatliche Sparrate ──────────────────────────────────────
    addTx(SAVINGS_CATEGORY, -Math.abs(variedCents(rng, 400, 0.15)), 28, "Übertrag Tagesgeldkonto");
  }

  return transactions;
}

/**
 * Erzeugt Budgets: Kategorie-Budgets (Plan vs. Ist) für die letzten Monate,
 * die monatliche Sparrate des aktuellen Monats sowie aktive & abgeschlossene
 * benannte Sparziele für die Sparplan-Ansicht.
 */
function buildBudgets(accountId, categoryMap, now) {
  const budgets = [];
  const curMonth0 = now.getMonth();
  const curYear = now.getFullYear();

  // Kategorie-Budgets für aktuellen + letzte 3 Monate.
  for (let k = 0; k <= 3; k++) {
    const d = new Date(curYear, curMonth0 - k, 1);
    for (const [cat, amountCents] of CATEGORY_BUDGETS) {
      budgets.push({
        accountId,
        categoryId: categoryMap[cat],
        title: "",
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        amountCents
      });
    }
  }

  // Monatliche Sparrate des aktuellen Monats → speist `plannedSavings` im Dashboard.
  budgets.push({
    accountId,
    categoryId: null,
    title: "Monatliche Sparrate",
    month: curMonth0 + 1,
    year: curYear,
    amountCents: 40000
  });

  // Aktive, benannte Sparziele (Zielmonat in der Zukunft).
  const futureMonth = (addMonths) => {
    const d = new Date(curYear, curMonth0 + addMonths, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  };
  // Nächster zukünftiger Juli (Sommerurlaub).
  const summerYear = now.getMonth() >= 6 ? curYear + 1 : curYear;
  const activeGoals = [
    { title: "Notgroschen aufstocken", ...futureMonth(3), amountCents: 500000 },
    { title: `Sommerurlaub ${summerYear}`, month: 7, year: summerYear, amountCents: 400000 },
    { title: "Neues Familienauto", ...futureMonth(20), amountCents: 1200000 }
  ];
  for (const g of activeGoals) {
    budgets.push({ accountId, categoryId: null, title: g.title, month: g.month, year: g.year, amountCents: g.amountCents });
  }

  // Abgeschlossene Sparziele (Historie) mit Abschlusszeitpunkt + entnommenem Betrag.
  for (const spec of COMPLETED_GOAL_SPECS) {
    const d = new Date(curYear, curMonth0 - spec.k, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const title = spec.title === "Sommerurlaub" ? `${spec.title} ${year}` : spec.title;
    budgets.push({
      accountId,
      categoryId: null,
      title,
      month,
      year,
      amountCents: spec.amountCents,
      completedAt: new Date(year, d.getMonth(), 20, 12, 0, 0),
      spentCents: spec.spentCents
    });
  }

  return budgets;
}

/**
 * Legt die laufenden Daueraufträge an. `nextOccurrence` zeigt auf die jeweils
 * nächste fällige Buchung: Liegt der Stichtag im laufenden Monat noch vor uns,
 * wird er als „diesen Monat" projiziert (und ist in der Historie noch nicht
 * gebucht); andernfalls auf den Folgemonat — so vermeidet die Projektion
 * Doppelzählungen mit bereits gebuchten Transaktionen.
 */
async function createRecurring(prisma, accountId, categoryMap, now) {
  const curYear = now.getFullYear();
  const curMonth0 = now.getMonth();
  const today = now.getDate();

  const data = RECURRING_ITEMS.map((item) => {
    const occurredThisMonth = today >= item.day;
    const next = occurredThisMonth
      ? new Date(curYear, curMonth0 + 1, item.day, 12, 0, 0)
      : new Date(curYear, curMonth0, item.day, 12, 0, 0);
    return {
      accountId,
      categoryId: categoryMap[item.cat] ?? null,
      amountCents: item.cents,
      description: item.desc,
      frequency: "MONTHLY",
      intervalMonths: 1,
      dayOfMonth: item.day,
      nextOccurrence: next
    };
  });

  await prisma.recurringTransaction.createMany({ data });
}

/**
 * Stellt sicher, dass der Demo-User samt realistischer Beispieldaten existiert.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @returns {Promise<{ refreshed: boolean }>}
 */
async function ensureDemoData(prisma) {
  const now = new Date();

  // Versions-Sonde VOR jeglichem Schreibzugriff: Existiert ein älterer Demo-User
  // ohne die aktuelle Sonde-Kategorie, gelten seine Daten als veraltet.
  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true }
  });
  let versionMatches = false;
  if (existingUser) {
    const probe = await prisma.category.findFirst({
      where: { userId: existingUser.id, name: VERSION_PROBE_CATEGORY },
      select: { id: true }
    });
    versionMatches = Boolean(probe);
  }

  const { account, categoryMap } = await ensureUserAndAccount(prisma);

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

  // Daten gelten als vollständig & frisch, wenn die Datensatz-Version stimmt,
  // die jüngste Transaktion im aktuellen Monat liegt UND die älteste den vollen
  // ~36-Monats-Zeitraum abdeckt.
  if (versionMatches && latest && oldest) {
    const newest = latest.occurredAt;
    const isCurrentMonth =
      newest.getFullYear() === now.getFullYear() && newest.getMonth() === now.getMonth();
    const monthSpan =
      (now.getFullYear() - oldest.occurredAt.getFullYear()) * 12 +
      (now.getMonth() - oldest.occurredAt.getMonth());
    if (isCurrentMonth && monthSpan >= MONTHS_BACK - 2) {
      return { refreshed: false };
    }
  }

  // Unvollständig, veraltet oder ältere Version → komplett neu generieren.
  await clearAccountData(prisma, account.id);
  await deleteStaleCategories(prisma, account.userId);

  const transactions = buildTransactions(account.id, categoryMap, now);
  await prisma.transaction.createMany({ data: transactions });

  const budgets = buildBudgets(account.id, categoryMap, now);
  await prisma.budget.createMany({ data: budgets });

  await createRecurring(prisma, account.id, categoryMap, now);

  return { refreshed: true };
}

module.exports = { ensureDemoData, DEMO_DATA_VERSION };
