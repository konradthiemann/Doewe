import { execSync } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Point Prisma to a dedicated test database before any imports that instantiate Prisma
const appDir = path.resolve(__dirname, "..");
process.env.DATABASE_URL = `file:${path.join(appDir, "prisma", "test.db")}`;

// Prepare the test database schema
beforeAll(() => {
  execSync("npx prisma generate", { cwd: appDir, stdio: "inherit", env: process.env });
  execSync("npx prisma db push --force-reset", { cwd: appDir, stdio: "inherit", env: process.env });
});

afterAll(() => {
  // nothing for now; could delete test db file if desired
});

describe("/api/transactions", () => {
  it("creates and lists transactions", async () => {
    // Seed minimal account & category directly via PrismaClient
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const account = await prisma.account.create({ data: { name: "Test Account" } });
    const category = await prisma.category.create({ data: { name: "Test Category" } });

    // Import route after env + schema are ready
    const routes = await import("../app/api/transactions/route");

    const body = {
      accountId: account.id,
      categoryId: category.id,
      amountCents: 2500,
      description: "Test Tx",
      occurredAt: new Date().toISOString()
    };
    const req = new Request("http://localhost/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const res = await routes.POST(req);
    expect(res.status).toBe(201);
  const created: { id: string; amountCents: number } = await res.json();
  expect(created.id).toBeTruthy();
  expect(created.amountCents).toBe(2500);

    const listRes = await routes.GET();
    expect(listRes.status).toBe(200);
  const list: Array<{ id: string; description: string }> = await listRes.json();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((t) => t.description === "Test Tx")).toBe(true);

    await prisma.$disconnect();
  });
});
