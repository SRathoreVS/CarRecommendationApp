import { PrismaClient } from "@prisma/client";

// Standard Next.js App Router pattern: avoid exhausting DB connections
// during dev hot-reload by reusing a single client instance.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
