import { prisma } from "./db";
import { dayOf, fromLocal, todayKey } from "./dates";
import { act } from "./log";

/** Called after a successful sign in: reuse today's open session, close older open ones at 18:30, open a new one. */
export async function recordSignIn(userId: string) {
  const today = todayKey();
  const open = await prisma.session.findMany({ where: { userId, signedOutAt: null } });
  for (const s of open) {
    if (s.day === today) return s;
    await prisma.session.update({ where: { id: s.id }, data: { signedOutAt: fromLocal(s.day, "18:30") } });
  }
  return prisma.session.create({ data: { userId, day: today, signedInAt: new Date() } });
}

/** Called on sign out: close the open session. A session from an earlier day closes at 18:30 of that day. */
export async function recordSignOut(userId: string) {
  const today = todayKey();
  const open = await prisma.session.findMany({ where: { userId, signedOutAt: null } });
  for (const s of open) {
    const out = s.day === today ? new Date() : fromLocal(s.day, "18:30");
    await prisma.session.update({ where: { id: s.id }, data: { signedOutAt: out < s.signedInAt ? s.signedInAt : out } });
  }
  if (open.length) await act(prisma, userId, "signed out");
}

/** Daily job: close sessions left open from earlier days. */
export async function closeStaleSessions() {
  const today = todayKey();
  const stale = await prisma.session.findMany({ where: { signedOutAt: null, day: { lt: today } } });
  for (const s of stale) await prisma.session.update({ where: { id: s.id }, data: { signedOutAt: fromLocal(s.day, "18:30") } });
  return stale.length;
}

export const sessionDay = (d: Date) => dayOf(d);
