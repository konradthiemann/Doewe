import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

const UpdateInput = z
  .object({
    name: z.string().min(1).optional(),
    mergeIntoCategoryId: z.string().min(1).optional()
  })
  .refine((data) => Boolean(data.name || data.mergeIntoCategoryId), {
    message: "No update fields provided"
  });

const DeleteInput = z
  .object({
    fallbackCategoryId: z.string().min(1).optional(),
    fallbackName: z.string().min(1).optional()
  })
  .refine((data) => Boolean(data.fallbackCategoryId || data.fallbackName), {
    message: "Fallback is required"
  });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sourceCategory = await prisma.category.findFirst({ where: { id: params.id, userId: user.id } });
  if (!sourceCategory) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const json = await req.json();
  const parsed = UpdateInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, mergeIntoCategoryId } = parsed.data;

  if (mergeIntoCategoryId) {
    if (mergeIntoCategoryId === sourceCategory.id) {
      return NextResponse.json({ error: "Cannot merge into the same category" }, { status: 400 });
    }

    const targetCategory = await prisma.category.findFirst({ where: { id: mergeIntoCategoryId, userId: user.id } });
    if (!targetCategory) {
      return NextResponse.json({ error: "Target category not found" }, { status: 404 });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.transaction.updateMany({ where: { categoryId: sourceCategory.id }, data: { categoryId: targetCategory.id } });
        await tx.recurringTransaction.updateMany({ where: { categoryId: sourceCategory.id }, data: { categoryId: targetCategory.id } });
        await tx.budget.updateMany({ where: { categoryId: sourceCategory.id }, data: { categoryId: targetCategory.id } });
        await tx.category.delete({ where: { id: sourceCategory.id } });
      });
      return NextResponse.json(targetCategory);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Merge would create a duplicate budget or category" }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to merge category" }, { status: 500 });
    }
  }

  if (name) {
    try {
      const updated = await prisma.category.update({ where: { id: sourceCategory.id }, data: { name } });
      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Category name already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
    }
  }

  return NextResponse.json(sourceCategory);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sourceCategory = await prisma.category.findFirst({ where: { id: params.id, userId: user.id } });
  if (!sourceCategory) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const json = await req.json();
  const parsed = DeleteInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { fallbackCategoryId, fallbackName } = parsed.data;

  let targetCategoryId = fallbackCategoryId ?? null;

  if (fallbackCategoryId) {
    if (fallbackCategoryId === sourceCategory.id) {
      return NextResponse.json({ error: "Fallback cannot be the same category" }, { status: 400 });
    }
    const target = await prisma.category.findFirst({ where: { id: fallbackCategoryId, userId: user.id } });
    if (!target) {
      return NextResponse.json({ error: "Fallback category not found" }, { status: 404 });
    }
  }

  if (!targetCategoryId && fallbackName) {
    try {
      const created = await prisma.category.create({
        data: { name: fallbackName, userId: user.id, isIncome: sourceCategory.isIncome }
      });
      targetCategoryId = created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Fallback category name already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to create fallback category" }, { status: 500 });
    }
  }

  if (!targetCategoryId) {
    return NextResponse.json({ error: "Missing fallback category" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({ where: { categoryId: sourceCategory.id }, data: { categoryId: targetCategoryId } });
      await tx.recurringTransaction.updateMany({ where: { categoryId: sourceCategory.id }, data: { categoryId: targetCategoryId } });
      await tx.budget.updateMany({ where: { categoryId: sourceCategory.id }, data: { categoryId: targetCategoryId } });
      await tx.category.delete({ where: { id: sourceCategory.id } });
    });
    return NextResponse.json({ success: true, fallbackCategoryId: targetCategoryId });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Reassignment would create duplicate records" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
