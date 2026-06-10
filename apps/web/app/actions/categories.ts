"use server";

import { z } from "zod";

import { authActionClient } from "../../lib/safe-action";
import { prisma } from "../../lib/prisma";

const PROTECTED_CATEGORY_NAMES = ["savings", "sparen"];

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  isIncome: z.boolean().optional().default(false),
});

/**
 * Server Action: create a new category for the authenticated user.
 * Uses next-safe-action for type-safe input validation and auth guard.
 */
export const createCategoryAction = authActionClient
  .schema(createCategorySchema)
  .action(async ({ parsedInput, ctx: { user } }) => {
    const { name, isIncome } = parsedInput;

    if (PROTECTED_CATEGORY_NAMES.includes(name.toLowerCase().trim())) {
      throw new Error("This category name is reserved");
    }

    const created = await prisma.category.create({
      data: { name, isIncome: isIncome ?? false, userId: user.id },
    });

    return created;
  });
