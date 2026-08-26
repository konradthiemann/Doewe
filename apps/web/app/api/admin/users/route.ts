/**
 * GET /api/admin/users — paginierte Nutzerliste für das Symfony-Control-Plane-
 * Backend.
 *
 * Auth: `Authorization: Bearer <DOEWE_SERVICE_TOKEN>` (isAuthorizedService),
 * NICHT die Household-Session — analog zu `admin/stats/route.ts`, dieser
 * Endpoint übergreift bewusst Haushaltsgrenzen (Teil D).
 *
 * Query: `?page=1&pageSize=50` (page ≥ 1, 1 ≤ pageSize ≤ 200, Default 1/50).
 *
 * Body-Shape:
 * {
 *   page, pageSize, total,
 *   users: [{ id, email, name, createdAt, householdId, suspendedAt, deletedAt, lastLoginAt }]
 * }
 *
 * `lastLoginAt` ist vom jüngsten `LoginEvent` des Nutzers abgeleitet (null,
 * wenn noch nie eingeloggt — es gibt keine Login-Historie vor diesem Feature).
 */
import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { isAuthorizedService } from "../../../../lib/serviceAuth";

import { ListUsersQuery } from "./schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedService(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = ListUsersQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { page, pageSize } = parsed.data;
  const skip = (page - 1) * pageSize;

  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        suspendedAt: true,
        deletedAt: true,
        householdMember: { select: { householdId: true } }
      }
    })
  ]);

  const userIds = users.map((u) => u.id);
  const lastLogins = userIds.length
    ? await prisma.loginEvent.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _max: { createdAt: true }
      })
    : [];
  const lastLoginMap = new Map(lastLogins.map((l) => [l.userId, l._max.createdAt]));

  return NextResponse.json({
    page,
    pageSize,
    total,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
      householdId: u.householdMember?.householdId ?? null,
      suspendedAt: u.suspendedAt,
      deletedAt: u.deletedAt,
      lastLoginAt: lastLoginMap.get(u.id) ?? null
    }))
  });
}
