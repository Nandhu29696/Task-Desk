// Handing over a person's responsibilities when they leave or lose lead access.
import type { Prisma } from "@prisma/client";
import { OPEN } from "./constants";
import { act } from "./log";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Moves a person's responsibilities to a lead or admin (`to`) when they are deactivated or made a member.
 * Always: projects they lead and the people who report to them.
 * When leaving: also open tasks, undone subtasks, recurring tasks assigned to them, pending approvals and client accounts.
 * Returns what moved, for the toast and the notification.
 */
export async function handOver(tx: Prisma.TransactionClient, fromId: string, to: string, o: { leaving: boolean; actorId: string }) {
  const moved: string[] = [];
  const led = await tx.project.findMany({ where: { leadId: fromId }, select: { id: true } });
  if (led.length) {
    await tx.project.updateMany({ where: { leadId: fromId }, data: { leadId: to } });
    await tx.projectMember.createMany({ data: led.map((p) => ({ projectId: p.id, userId: to })), skipDuplicates: true });
    for (const p of led) await act(tx, o.actorId, "changed project lead", "handed over", null, p.id);
    moved.push(plural(led.length, "project to lead", "projects to lead"));
  }
  const reports = await tx.user.updateMany({ where: { reportsToId: fromId }, data: { reportsToId: to } });
  if (reports.count) moved.push(plural(reports.count, "person reporting", "people reporting"));
  if (!o.leaving) return moved;

  const tasks = await tx.task.updateMany({ where: { assigneeId: fromId, status: { in: OPEN } }, data: { assigneeId: to } });
  if (tasks.count) moved.push(plural(tasks.count, "open task", "open tasks"));
  const subs = await tx.subtask.updateMany({ where: { assigneeId: fromId, done: false, task: { status: { in: OPEN } } }, data: { assigneeId: to } });
  if (subs.count) moved.push(plural(subs.count, "subtask", "subtasks"));
  const rules = await tx.recurringRule.updateMany({ where: { assigneeId: fromId }, data: { assigneeId: to } });
  if (rules.count) moved.push(plural(rules.count, "recurring task", "recurring tasks"));
  const approvals = await tx.taskApproval.updateMany({ where: { approverId: fromId, status: "PENDING", requestedById: { not: to } }, data: { approverId: to } });
  if (approvals.count) moved.push(plural(approvals.count, "approval", "approvals"));
  const clients = await tx.client.updateMany({ where: { ownerId: fromId }, data: { ownerId: to } });
  if (clients.count) moved.push(plural(clients.count, "client account", "client accounts"));
  return moved;
}
