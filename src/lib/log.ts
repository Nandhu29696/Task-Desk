import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

type Db = Prisma.TransactionClient | PrismaClient;

/** Writes one activity row. Call it inside the same transaction as the change. */
export async function act(db: Db, userId: string | null, action: string, detail = "", taskId: string | null = null, projectId: string | null = null) {
  await db.activity.create({ data: { userId, action, detail, taskId, projectId } });
}

/** One notification for one person. Never notifies the person who did the action. */
export async function notify(db: Db, userId: string | null | undefined, kind: string, title: string, body = "", link = "", fromId: string | null = null) {
  if (!userId || userId === fromId) return;
  await db.notification.create({ data: { userId, kind, title, body, link, fromId } });
}

export async function notifyMany(db: Db, userIds: (string | null | undefined)[], kind: string, title: string, body = "", link = "", fromId: string | null = null) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== fromId))];
  if (!ids.length) return;
  await db.notification.createMany({ data: ids.map((userId) => ({ userId, kind, title, body, link, fromId })) });
}

export async function notifyAdmins(db: Db, kind: string, title: string, body = "", link = "", fromId: string | null = null) {
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  await notifyMany(db, admins.map((a) => a.id), kind, title, body, link, fromId);
}

export { prisma };
