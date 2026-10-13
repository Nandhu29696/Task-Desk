import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./session";
import { toUser, userSelect, type U } from "./model";

export type Me = U & { mustChangePassword: boolean };

export const getCurrentUser = cache(async (): Promise<Me | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const row = await prisma.user.findUnique({ where: { id: session.userId }, select: { ...userSelect, mustChangePassword: true } });
  if (!row || !row.active) return null;
  return { ...toUser(row), mustChangePassword: row.mustChangePassword };
});

export async function requireUser(): Promise<Me> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: string[]): Promise<Me> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

export async function startSession(userId: string, role: string) {
  const token = await signSession(userId, role);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
