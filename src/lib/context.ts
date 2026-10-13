import "server-only";
import { cache } from "react";
import { prisma } from "./db";
import { requireUser, type Me } from "./auth";
import { loadCal, loadUsers, type Cal, type U } from "./model";
import { stampOf, todayKey } from "./dates";

export type Ctx = {
  me: Me;
  today: string;
  now: string; // local stamp "day HH:MM"
  users: U[];
  user: (id: string | null | undefined) => U | undefined;
  active: U[];
  cal: Cal;
  /** People on approved leave today. */
  onLeaveToday: Set<string>;
};

/** Everything most pages need, loaded once per request. Redirects to /login when signed out. */
export const getCtx = cache(async (): Promise<Ctx> => {
  const me = await requireUser();
  const today = todayKey();
  const [users, cal, leaves] = await Promise.all([
    loadUsers(),
    loadCal(),
    prisma.leave.findMany({ where: { status: "APPROVED", fromDate: { lte: today }, toDate: { gte: today } }, select: { userId: true } }),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    me, today, now: stampOf(new Date())!, users,
    user: (id) => (id ? byId.get(id) : undefined),
    active: users.filter((u) => u.active),
    cal,
    onLeaveToday: new Set(leaves.map((l) => l.userId)),
  };
});

/** [id, name] options for active people, for assignee pickers. */
export const userOpts = (ctx: Ctx): [string, string][] => ctx.active.map((u) => [u.id, u.name + (u.id === ctx.me.id ? " (me)" : "")]);
