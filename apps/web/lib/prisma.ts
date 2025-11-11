import { PrismaClient } from "@prisma/client";

// Ensure a single PrismaClient instance is used across hot-reloads in development.
// This attaches the PrismaClient to the global object, preventing multiple instances
// which can cause connection issues with the database.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Shared PrismaClient instance for database access across the app.
// Ensures a single client is used, preventing multiple connections and issues during hot-reloads.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"]
  });

// In development, attach PrismaClient to the global object to prevent
// multiple instances during hot-reloads, which can cause connection issues.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}