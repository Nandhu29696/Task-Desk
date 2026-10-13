"use server";

import { prisma } from "@/lib/db";
import { DAY_CAPACITY, OPEN, PRANK, PRIORITIES, SLOT } from "@/lib/constants";
import { isDayKey, todayKey } from "@/lib/dates";
import { act } from "@/lib/log";
import { parseJson } from "@/lib/model";
import { sortTasks } from "@/lib/logic";
import { ok, refuse, run, str, type Result } from "@/lib/action";

type PlanItem = { taskId: string; slot: string };

async function loadPlan(userId: string, date: string) {
  const row = await prisma.dayPlan.findUnique({ where: { userId_date: { userId, date } } });
  return parseJson<PlanItem[]>(row?.items, []).filter((i) => i && typeof i.taskId === "string" && SLOT[i.slot]);
}
async function savePlan(userId: string, date: string, items: PlanItem[]) {
  const json = JSON.stringify(items);
  await prisma.dayPlan.upsert({ where: { userId_date: { userId, date } }, update: { items: json }, create: { userId, date, items: json } });
}

/** Plan my day: add one task to a slot. Fields: taskId, slot. */
export async function addToPlan(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const t0 = todayKey(), taskId = str(fd, "taskId"), slot = str(fd, "slot");
    if (!taskId) refuse("Pick a task to plan.");
    if (!SLOT[slot]) refuse("Pick a time of day.");
    const t = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!t) refuse("This task was deleted.");
    const items = await loadPlan(me.id, t0);
    if (!items.some((i) => i.taskId === taskId)) items.push({ taskId, slot });
    await savePlan(me.id, t0, items);
    return ok("Added to your plan");
  });
}

/** Moves a planned task to another slot. Fields: id (task), slot. */
export async function setPlanSlot(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const t0 = todayKey(), id = str(fd, "id"), slot = str(fd, "slot");
    if (!SLOT[slot]) refuse("Pick a time of day.");
    const items = await loadPlan(me.id, t0);
    const it = items.find((i) => i.taskId === id);
    if (!it) refuse("This task is not in your plan.");
    it!.slot = slot;
    await savePlan(me.id, t0, items);
    return ok("Moved to " + SLOT[slot].toLowerCase());
  });
}

/** Removes a task from today's plan. Field: id (task). */
export async function removeFromPlan(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const t0 = todayKey(), id = str(fd, "id");
    const items = await loadPlan(me.id, t0);
    await savePlan(me.id, t0, items.filter((i) => i.taskId !== id));
    return ok("Removed from your plan");
  });
}

export async function clearPlan(_p: Result, _fd: FormData): Promise<Result> {
  return run(async (me) => {
    await savePlan(me.id, todayKey(), []);
    return ok("Plan cleared");
  });
}

/**
 * Plan for me: my open tasks (assignee or collaborator) due today or earlier and not planned,
 * by priority then due date, added while the day stays within 480 minutes.
 * Slot by running total: up to 210 Morning, up to 420 Afternoon, else Evening.
 */
export async function planForMe(_p: Result, _fd: FormData): Promise<Result> {
  return run(async (me) => {
    const t0 = todayKey();
    const items = await loadPlan(me.id, t0);
    const planned = items.length ? await prisma.task.findMany({ where: { id: { in: items.map((i) => i.taskId) } }, select: { id: true, estimate: true } }) : [];
    const est = new Map(planned.map((t) => [t.id, t.estimate]));
    const kept = items.filter((i) => est.has(i.taskId));
    let used = kept.reduce((a, i) => a + (est.get(i.taskId) || 30), 0);
    const rows = await prisma.task.findMany({
      where: { status: { in: OPEN }, dueDate: { not: null, lte: t0 }, id: { notIn: kept.map((i) => i.taskId) }, OR: [{ assigneeId: me.id }, { collaborators: { some: { userId: me.id } } }] },
      select: { id: true, dueDate: true, priority: true, estimate: true },
    });
    const cand = sortTasks(rows).sort((a, b) => PRANK[a.priority] - PRANK[b.priority]);
    let added = 0;
    for (const t of cand) {
      const m = t.estimate || 30;
      if (used + m > DAY_CAPACITY) continue;
      used += m;
      kept.push({ taskId: t.id, slot: used <= 210 ? "MORNING" : used <= 420 ? "AFTERNOON" : "EVENING" });
      added++;
    }
    await savePlan(me.id, t0, kept);
    return ok(added ? `${added} tasks planned` : "Nothing more to plan for today");
  });
}

/** Quick add on the dashboard: a one time task for me. Fields: title, projectId, dueDate, priority. */
export async function quickAdd(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const title = str(fd, "title");
    if (!title) refuse("Add a title.");
    const projectId = str(fd, "projectId") || null;
    const project = projectId ? await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, line: true } }) : null;
    if (projectId && !project) refuse("This project was deleted.");
    const dueDate = isDayKey(str(fd, "dueDate")) ? str(fd, "dueDate") : todayKey();
    const priority = PRIORITIES.includes(str(fd, "priority")) ? str(fd, "priority") : "MEDIUM";
    await prisma.$transaction(async (tx) => {
      const t = await tx.task.create({ data: { title, projectId, assigneeId: me.id, createdById: me.id, frequency: "ONCE", category: project?.line || "GENERAL", priority, dueDate } });
      await act(tx, me.id, "created task", t.title, t.id, projectId);
    });
    return ok("Task added");
  });
}
