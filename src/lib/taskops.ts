// Status changes with all their side effects, shared by the task page, lists, the board and the dashboard.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { STATUS, closed } from "./constants";
import { act, notify } from "./log";
import { canEdit } from "./permissions";

type Tx = Prisma.TransactionClient;
export type StatusResult = { ok: true } | { ok: false; error: string };

/** Open linked tasks and pending approvals of a task. */
export async function blockersOf(tx: Tx, taskId: string) {
  const [deps, approvals] = await Promise.all([
    tx.taskDependency.findMany({ where: { taskId, dependsOn: { status: { notIn: ["DONE", "CANCELLED"] } } }, include: { dependsOn: { select: { title: true } } } }),
    tx.taskApproval.findMany({ where: { taskId, status: "PENDING" }, include: { approver: { select: { name: true } } } }),
  ]);
  return { deps, approvals, count: deps.length + approvals.length };
}

/** When a task closes, every task waiting on it with no blockers left moves back to To do. */
export async function releaseDependents(tx: Tx, task: { id: string; title: string; status: string }, byId: string | null) {
  const waiting = await tx.taskDependency.findMany({ where: { dependsOnId: task.id, task: { status: "WAITING" } }, select: { taskId: true } });
  for (const w of waiting) {
    const b = await blockersOf(tx, w.taskId);
    if (b.count) continue;
    const x = await tx.task.update({ where: { id: w.taskId }, data: { status: "TODO" } });
    await notify(tx, x.assigneeId, "UPDATE", `Ready to start: ${x.title}`, `${task.title} is ${STATUS[task.status].toLowerCase()}`, `/tasks/${x.id}`, byId);
    await act(tx, byId, "dependency cleared", `${task.title} is ${STATUS[task.status].toLowerCase()}`, x.id, x.projectId);
  }
}

/** Moves a task to a status. Done is refused while blockers remain. Checks edit rights. */
export async function changeStatus(me: { id: string; role: string }, taskId: string, status: string): Promise<StatusResult> {
  if (!STATUS[status]) return { ok: false, error: "Unknown status" };
  return prisma.$transaction(async (tx) => {
    const t = await tx.task.findUnique({ where: { id: taskId }, include: { collaborators: { select: { userId: true } }, project: { select: { leadId: true } } } });
    if (!t) return { ok: false, error: "This task was deleted." } as const;
    if (!canEdit(me, { assigneeId: t.assigneeId, createdById: t.createdById, collab: t.collaborators.map((c) => c.userId) }, t.project)) return { ok: false, error: "You cannot change this task." } as const;
    if (t.status === status) return { ok: true } as const;
    if (status === "DONE") {
      const b = await blockersOf(tx, t.id);
      if (b.deps.length) return { ok: false, error: `Finish "${b.deps[0].dependsOn.title}" first, or remove the dependency` } as const;
      if (b.approvals.length) return { ok: false, error: `Waiting for approval from ${b.approvals[0].approver.name}` } as const;
    }
    const now = new Date();
    const x = await tx.task.update({ where: { id: t.id }, data: { status, completedAt: status === "DONE" ? now : null, cancelledAt: status === "CANCELLED" ? now : null } });
    await act(tx, me.id, status === "DONE" ? "completed task" : "changed status", status === "DONE" ? t.title : `${STATUS[t.status]} to ${STATUS[status]}`, t.id, t.projectId);
    if (closed(status)) await releaseDependents(tx, x, me.id);
    return { ok: true } as const;
  });
}
