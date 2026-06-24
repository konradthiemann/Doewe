/* Seed: Demo-User mit 36 Monaten Beispieldaten (Einnahmen, Ausgaben, Sparen). */
const { PrismaClient } = require("@prisma/client");

const { ensureDemoData } = require("../lib/demoData");

const prisma = new PrismaClient();

async function main() {
  const result = await ensureDemoData(prisma);
  console.log(result.refreshed ? "Demo data (re)generated." : "Demo data already current — skipped.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
