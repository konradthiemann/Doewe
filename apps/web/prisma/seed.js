/* Minimal seed for dev */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.upsert({
    where: { id: "acc_demo" },
    update: {},
    create: { id: "acc_demo", name: "Demo Account" }
  });

  const category = await prisma.category.upsert({
    where: { name: "Groceries" },
    update: {},
    create: { name: "Groceries" }
  });

  await prisma.transaction.create({
    data: {
      accountId: account.id,
      categoryId: category.id,
      amountCents: -1234,
      description: "Initial seed transaction",
      occurredAt: new Date()
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());