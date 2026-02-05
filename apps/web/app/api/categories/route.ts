import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const CategoryInput = z.object({
  name: z.string().min(1, "Name is required"),
  isIncome: z.boolean().optional().default(false)
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check for sort parameter
  const url = new URL(req.url);
  const sortByUsage = url.searchParams.get("sortByUsage") === "true";

  // Get user's account(s) for transaction counting
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { id: true }
  });
  const accountIds = accounts.map((a) => a.id);

  if (sortByUsage && accountIds.length > 0) {
    // Get categories with usage count
    const categories = await prisma.category.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: {
            transactions: {
              where: { accountId: { in: accountIds } }
            }
          }
        }
      }
    });

    // Sort by usage count descending, then by name ascending
    const sorted = categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        isIncome: c.isIncome,
        createdAt: c.createdAt,
        usageCount: c._count.transactions
      }))
      .sort((a, b) => {
        if (b.usageCount !== a.usageCount) {
          return b.usageCount - a.usageCount;
        }
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json(sorted);
  }

  // Default: order by createdAt
  const items = await prisma.category.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = CategoryInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  
  try {
    const created = await prisma.category.create({
      data: { name: parsed.data.name, isIncome: parsed.data.isIncome, userId: user.id }
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    // Handle unique constraint violation (category name already exists)
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Category with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
