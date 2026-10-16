// Prisma client with a driver adapter (no Rust query engine needed at runtime).
// MySQL: DATABASE_URL="mysql://..." matches the provider in prisma/schema.prisma.
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  if (!url.startsWith("mysql://")) throw new Error("DATABASE_URL must use the mysql:// scheme.");
  return new PrismaClient({ adapter: new PrismaMariaDb(url) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
