// Prisma client with a driver adapter (no Rust query engine needed at runtime).
// PostgreSQL: DATABASE_URL="postgresql://..." matches the provider in prisma/schema.prisma.
// SQLite URLs remain supported by the driver selection for development migrations.
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");

  if (url.startsWith("postgres")) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }

  // Resolve relative SQLite paths against the prisma folder, exactly like the Prisma CLI does
  let fileUrl = url;
  if (url.startsWith("file:") && !url.startsWith("file:/")) {
    fileUrl = "file:" + path.join(process.cwd(), "prisma", url.slice(5));
  }
  return new PrismaClient({ adapter: new PrismaLibSQL({ url: fileUrl }) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
