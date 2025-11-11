/* Enhanced seed: demo incomes & outgoings for dashboard charts */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.upsert({
    where: { id: "acc_demo" },
    update: {},
    create: { id: "acc_demo", name: "Demo Account" }
  });

  // Expense categories (outgoings)
  const expenseCategories = [
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
  // Income categories
  const incomeCategories = ["Salary 1", "Salary 2", "Child benefit", "Misc Income"];
  // Special category for savings transfers (outgoing to savings)
  const savingsCategory = "Savings";

  const categoryMap = {};
  for (const name of [...expenseCategories, ...incomeCategories, savingsCategory]) {
    const isIncome = incomeCategories.includes(name);
    const cat = await prisma.category.upsert({
      where: { name },
      update: { isIncome },
      create: { name, isIncome }
    });
    categoryMap[name] = cat.id;
  }

  // Outgoing amounts (negative) matching expense categories (in euros)
  const outgoingValues = [120, 80, 150, 60, 40, 35, 50, 100, 30, 25, 45, 20];
  // Income amounts (positive)
  const incomeValues = [2500, 1500, 250, 100];

  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), 5, 12, 0, 0);

  // Create expense transactions
  for (let i = 0; i < expenseCategories.length; i++) {
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        categoryId: categoryMap[expenseCategories[i]],
        amountCents: -Math.round(outgoingValues[i] * 100),
        description: `${expenseCategories[i]} expense`,
        occurredAt: new Date(baseDate.getTime() + i * 3600_000)
      }
    });
  }

  // Create income transactions
  for (let i = 0; i < incomeCategories.length; i++) {
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        categoryId: categoryMap[incomeCategories[i]],
        amountCents: Math.round(incomeValues[i] * 100),
        description: `${incomeCategories[i]} income`,
        occurredAt: new Date(baseDate.getTime() + (i + 20) * 3600_000)
      }
    });
  }

  // Create a savings transfer (outgoing) for this month to demonstrate monthly actual savings
  await prisma.transaction.create({
    data: {
      accountId: account.id,
      categoryId: categoryMap[savingsCategory],
      amountCents: -15000, // 150 € moved to savings this month
      description: "Monthly savings transfer",
      occurredAt: new Date(baseDate.getTime() + 15 * 3600_000)
    }
  });

  // Seed a savings budget (planned monthly savings) using Budget model (category optional)
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  // Because categoryId is nullable in a composite unique, we can't upsert directly with `null`.
  // Do a find + create/update sequence instead.
  const existing = await prisma.budget.findFirst({
    where: { accountId: account.id, categoryId: null, month, year }
  });
  if (existing) {
    await prisma.budget.update({ where: { id: existing.id }, data: { amountCents: 60000 } });
  } else {
    await prisma.budget.create({
      data: { accountId: account.id, categoryId: null, month, year, amountCents: 60000 }
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());