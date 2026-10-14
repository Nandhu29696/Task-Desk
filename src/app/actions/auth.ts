"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { endSession, getCurrentUser, startSession } from "@/lib/auth";
import { act } from "@/lib/log";
import { recordSignIn, recordSignOut } from "@/lib/sessions";
import { fail, ok, run, str, refuse, type Result } from "@/lib/action";

// Simple in memory limit: 5 failed tries per email per 15 minutes.
const tries = new Map<string, { n: number; until: number }>();

export async function login(_prev: Result, form: FormData): Promise<Result> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!email || !password) return fail("Enter your email and password.");
  const t = tries.get(email);
  if (t && t.n >= 5 && t.until > Date.now()) return fail("Too many tries. Wait 15 minutes or ask the admin to reset your password.");

  const user = await prisma.user.findUnique({ where: { email } });
  const good = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!good) {
    const cur = t && t.until > Date.now() ? t : { n: 0, until: Date.now() + 15 * 60 * 1000 };
    tries.set(email, { n: cur.n + 1, until: cur.until });
    return fail("That email and password do not match an active account.");
  }
  tries.delete(email);
  await startSession(user.id, user.role);
  await recordSignIn(user.id);
  await act(prisma, user.id, "signed in");
  redirect(user.mustChangePassword ? "/account?first=1" : "/");
}

export async function logout() {
  const me = await getCurrentUser();
  if (me) await recordSignOut(me.id);
  await endSession();
  redirect("/login");
}

export async function changePassword(_prev: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    // Passwords are taken exactly as typed (no trimming), the same way sign in reads them.
    const raw = (k: string) => String(fd.get(k) ?? "");
    const current = raw("current"), next = raw("next"), again = raw("again");
    if (next.length < 8) refuse("Use at least 8 characters.");
    if (next !== again) refuse("The new passwords do not match.");
    const row = await prisma.user.findUnique({ where: { id: me.id } });
    if (!row || !(await bcrypt.compare(current, row.passwordHash))) refuse("Your current password is not right.");
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false } });
    return ok("Password changed");
  }, { allowTempPassword: true });
}
