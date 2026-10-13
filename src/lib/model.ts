import { prisma } from "./db";
import { dayOf, stampOf } from "./dates";
import { DEFAULT_SETTINGS, type Settings } from "./constants";
import type { Prisma } from "@prisma/client";

// Plain shapes used by pages and the pure logic in src/lib/logic.ts.
// Day keys are strings, moments are local stamps ("day HH:MM") in the team time zone.

export type U = { id: string; name: string; email: string; role: string; title: string; phone: string; location: string; emp: string; active: boolean; reportsTo: string | null; addedBy: string | null };
export type Poc = { name: string; role: string; phone: string; email: string };
export type P = { id: string; name: string; clientId: string | null; clientLabel: string; industry: string; line: string; website: string; description: string; status: string; leadId: string | null; members: string[]; poc: Poc; comms: string[]; startDate: string | null };
export type R = { id: string; projectId: string; title: string; description: string; category: string; frequency: string; weekday: number | null; monthDay: number | null; skipWeekends: boolean; dueOffsetDays: number; startDate: string; endDate: string | null; assigneeId: string | null; priority: string; estimate: number | null; checklist: string[]; active: boolean; gen: string | null };
export type Sub = { id: string; title: string; assigneeId: string | null; done: boolean };
export type Appr = { id: string; userId: string; by: string | null; note: string; status: string; decidedAt: string | null };
export type T = { id: string; title: string; description: string; projectId: string | null; assigneeId: string | null; createdById: string | null; ruleId: string | null; occ: string | null; renewKey: string | null; frequency: string; category: string; status: string; priority: string; dueDate: string | null; estimate: number | null; spent: number; completedAt: string | null; cancelledAt: string | null; createdOn: string; collab: string[]; deps: string[]; subtasks: Sub[]; approvals: Appr[] };

export const userSelect = { id: true, name: true, email: true, role: true, title: true, phone: true, location: true, empType: true, active: true, reportsToId: true, addedById: true } as const;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
export const toUser = (u: UserRow): U => ({ id: u.id, name: u.name, email: u.email, role: u.role, title: u.title || "", phone: u.phone || "", location: u.location || "", emp: u.empType, active: u.active, reportsTo: u.reportsToId, addedBy: u.addedById });

export const projectInclude = { members: { select: { userId: true } }, client: { select: { name: true } } } as const;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
export const toProject = (p: ProjectRow): P => ({
  id: p.id, name: p.name, clientId: p.clientId, clientLabel: p.client?.name || p.clientLabel || "", industry: p.industry || "", line: p.line, website: p.website || "", description: p.description || "", status: p.status, leadId: p.leadId,
  members: p.members.map((m) => m.userId), poc: { name: p.pocName || "", role: p.pocRole || "", phone: p.pocPhone || "", email: p.pocEmail || "" }, comms: splitList(p.comms), startDate: p.startDate,
});

type RuleRow = Prisma.RecurringRuleGetPayload<object>;
export const toRule = (r: RuleRow): R => ({ id: r.id, projectId: r.projectId, title: r.title, description: r.description || "", category: r.category, frequency: r.frequency, weekday: r.weekday, monthDay: r.monthDay, skipWeekends: r.skipWeekends, dueOffsetDays: r.dueOffsetDays, startDate: r.startDate, endDate: r.endDate, assigneeId: r.assigneeId, priority: r.priority, estimate: r.estimate, checklist: parseJson<string[]>(r.checklist, []), active: r.active, gen: r.generatedThrough });

export const taskInclude = {
  collaborators: { select: { userId: true } },
  dependsOn: { select: { dependsOnId: true } },
  subtasks: { orderBy: { sortOrder: "asc" as const } },
  approvals: { orderBy: { createdAt: "asc" as const } },
} as const;
type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
export const toTask = (t: TaskRow): T => ({
  id: t.id, title: t.title, description: t.description, projectId: t.projectId, assigneeId: t.assigneeId, createdById: t.createdById, ruleId: t.ruleId, occ: t.occurrenceDate, renewKey: t.renewKey, frequency: t.frequency, category: t.category, status: t.status, priority: t.priority, dueDate: t.dueDate, estimate: t.estimate, spent: t.spentMinutes,
  completedAt: stampOf(t.completedAt), cancelledAt: stampOf(t.cancelledAt), createdOn: dayOf(t.createdAt),
  collab: t.collaborators.map((c) => c.userId), deps: t.dependsOn.map((d) => d.dependsOnId),
  subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, assigneeId: s.assigneeId, done: s.done })),
  approvals: t.approvals.map((a) => ({ id: a.id, userId: a.approverId, by: a.requestedById, note: a.note, status: a.status, decidedAt: stampOf(a.decidedAt) })),
});

export const splitList = (s: string | null | undefined) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
export function parseJson<X>(s: string | null | undefined, fallback: X): X { try { return s ? (JSON.parse(s) as X) : fallback; } catch { return fallback; } }

// ============ loaders ============

export async function loadUsers(): Promise<U[]> {
  const rows = await prisma.user.findMany({ select: userSelect, orderBy: { name: "asc" } });
  return rows.map(toUser);
}
export async function loadProjects(where: Prisma.ProjectWhereInput = {}): Promise<P[]> {
  const rows = await prisma.project.findMany({ where, include: projectInclude, orderBy: { name: "asc" } });
  return rows.map(toProject);
}
export async function loadRules(where: Prisma.RecurringRuleWhereInput = {}): Promise<R[]> {
  return (await prisma.recurringRule.findMany({ where, orderBy: { createdAt: "asc" } })).map(toRule);
}
export async function loadTasks(where: Prisma.TaskWhereInput = {}): Promise<T[]> {
  const rows = await prisma.task.findMany({ where, include: taskInclude });
  return rows.map(toTask);
}
export async function loadTask(id: string): Promise<T | null> {
  const row = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  return row ? toTask(row) : null;
}

export type Cal = { settings: Settings; holidays: { id: string; date: string; name: string; type: string }[] };
export async function loadSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const out: Settings = { ...DEFAULT_SETTINGS, allow: { ...DEFAULT_SETTINGS.allow } };
  for (const r of rows) {
    const v = parseJson<unknown>(r.value, null);
    if (v === null) continue;
    (out as Record<string, unknown>)[r.key] = v;
  }
  return out;
}
export async function loadCal(): Promise<Cal> {
  const [settings, holidays] = await Promise.all([loadSettings(), prisma.holiday.findMany({ orderBy: { date: "asc" } })]);
  return { settings, holidays: holidays.map((h) => ({ id: h.id, date: h.date, name: h.name, type: h.type })) };
}
export async function saveSetting(key: keyof Settings, value: unknown, tx: Prisma.TransactionClient = prisma) {
  await tx.setting.upsert({ where: { key }, update: { value: JSON.stringify(value) }, create: { key, value: JSON.stringify(value) } });
}

export type Leave = { id: string; userId: string; type: string; from: string; to: string; half: boolean; reason: string; status: string; decidedBy: string | null; decidedAt: string | null; createdAt: string };
export async function loadLeaves(where: Prisma.LeaveWhereInput = {}): Promise<Leave[]> {
  const rows = await prisma.leave.findMany({ where, orderBy: { fromDate: "asc" } });
  return rows.map((l) => ({ id: l.id, userId: l.userId, type: l.type, from: l.fromDate, to: l.toDate, half: l.half, reason: l.reason, status: l.status, decidedBy: l.decidedById, decidedAt: stampOf(l.decidedAt), createdAt: stampOf(l.createdAt)! }));
}

export type Sess = { id: string; userId: string; in: string; out: string | null };
export async function loadSessions(where: Prisma.SessionWhereInput = {}): Promise<Sess[]> {
  const rows = await prisma.session.findMany({ where, orderBy: { signedInAt: "asc" } });
  return rows.map((s) => ({ id: s.id, userId: s.userId, in: stampOf(s.signedInAt)!, out: stampOf(s.signedOutAt) }));
}

export type Act = { id: string; userId: string | null; action: string; detail: string; taskId: string | null; projectId: string | null; at: string };
export async function loadActivities(where: Prisma.ActivityWhereInput = {}, take = 500): Promise<Act[]> {
  const rows = await prisma.activity.findMany({ where, orderBy: { createdAt: "desc" }, take });
  return rows.map((a) => ({ id: a.id, userId: a.userId, action: a.action, detail: a.detail, taskId: a.taskId, projectId: a.projectId, at: stampOf(a.createdAt)! }));
}

export type TLog = { id: string; taskId: string; userId: string; minutes: number; on: string; note: string };
export async function loadTimeLogs(where: Prisma.TimeLogWhereInput = {}): Promise<TLog[]> {
  const rows = await prisma.timeLog.findMany({ where, orderBy: { createdAt: "asc" } });
  return rows.map((l) => ({ id: l.id, taskId: l.taskId, userId: l.userId, minutes: l.minutes, on: l.workDate, note: l.note }));
}

export type Cmt = { id: string; taskId: string; userId: string; body: string; at: string };
export async function loadComments(where: Prisma.CommentWhereInput = {}): Promise<Cmt[]> {
  const rows = await prisma.comment.findMany({ where, orderBy: { createdAt: "asc" } });
  return rows.map((c) => ({ id: c.id, taskId: c.taskId, userId: c.userId, body: c.body, at: stampOf(c.createdAt)! }));
}
