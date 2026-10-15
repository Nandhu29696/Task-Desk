"use server";

import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FREQ, FREQS, LINES, PRIORITIES, PRIORITY, closed } from "@/lib/constants";
import { fmtDate, isDayKey, mins, todayKey } from "@/lib/dates";
import { act, notify } from "@/lib/log";
import { blockersOf } from "@/lib/taskops";
import { canDelete, canEdit, canManage, canReassign, isAdmin, isLeadOrAdmin } from "@/lib/permissions";
import { generate } from "@/lib/generator";
import { mentionedUsers } from "@/lib/logic";
import { loadUsers } from "@/lib/model";
import { int, list, ok, opt, refuse, run, str, type Result } from "@/lib/action";
import type { Me } from "@/lib/auth";

type Tx = Prisma.TransactionClient;
const link = (id: string) => `/tasks/${id}`;

const taskFull = { collaborators: { select: { userId: true } }, project: { select: { leadId: true } } } as const;
type TaskFull = Prisma.TaskGetPayload<{ include: typeof taskFull }>;
const like = (t: TaskFull) => ({ assigneeId: t.assigneeId, createdById: t.createdById, collab: t.collaborators.map((c) => c.userId), projectId: t.projectId });

/** Loads a task with what the permission rules need, or stops with a message. */
async function getTask(tx: Tx, id: string): Promise<TaskFull> {
  const t = await tx.task.findUnique({ where: { id }, include: taskFull });
  if (!t) refuse("This task was deleted.");
  return t as TaskFull;
}
async function editable(tx: Tx, me: Me, id: string) {
  const t = await getTask(tx, id);
  if (!canEdit(me, like(t), t.project)) refuse("You cannot change this task.");
  return t;
}
/** When nothing blocks a waiting task any more, it goes back to To do. */
async function unwait(tx: Tx, t: { id: string; status: string }) {
  if (t.status !== "WAITING") return false;
  const b = await blockersOf(tx, t.id);
  if (b.count) return false;
  await tx.task.update({ where: { id: t.id }, data: { status: "TODO" } });
  return true;
}
const userName = async (tx: Tx, id: string | null | undefined) => (id ? (await tx.user.findUnique({ where: { id }, select: { name: true } }))?.name : undefined);

// ============ board or list view ============

/** Remembers Board or List per person in a cookie. Form field: v. */
export async function setTaskView(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const v = str(fd, "v") === "LIST" ? "LIST" : "BOARD";
    const store = await cookies();
    let map: Record<string, string> = {};
    try { map = JSON.parse(store.get("td_tview")?.value || "{}") as Record<string, string>; } catch { map = {}; }
    map[me.id] = v;
    const keep = Object.fromEntries(Object.entries(map).slice(-8));
    store.set("td_tview", JSON.stringify(keep), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
    return ok("");
  });
}

// ============ create, edit, delete ============

/** New task with Repeats set: a recurring rule on a project the person manages (preview newtask with frequency). */
async function createRecurring(me: Me, fd: FormData, project: { id: string; line: string; leadId: string | null; status: string; name: string } | null, freq: string): Promise<Result> {
  if (!FREQS.includes(freq)) refuse("Pick how often it repeats.");
  if (!project) refuse("Pick a project for a repeating task");
  const p = project!;
  if (!canManage(me, p)) refuse("Only the project lead or an admin can add repeating tasks to " + p.name);
  if (p.status !== "ACTIVE") refuse("This project is not active. Resume it before adding repeating tasks.");
  const want = opt(fd, "assigneeId");
  const assignee = isLeadOrAdmin(me) && want ? await prisma.user.findFirst({ where: { id: want, active: true }, select: { id: true } }) : null;
  const cat = str(fd, "category"), pr = str(fd, "priority"), due = str(fd, "dueDate"), est = int(fd, "estimate");
  const wd = int(fd, "weekday"), md = int(fd, "monthDay");
  const r = await prisma.$transaction(async (tx) => {
    const r = await tx.recurringRule.create({
      data: {
        projectId: p.id, title: str(fd, "title"), description: str(fd, "description"), category: LINES.includes(cat) ? cat : p.line, frequency: freq,
        weekday: freq === "WEEKLY" ? Math.min(6, Math.max(0, wd ?? 1)) : null,
        monthDay: freq === "MONTHLY" || freq === "QUARTERLY" ? Math.min(31, Math.max(1, md ?? 1)) : null,
        skipWeekends: freq === "DAILY" ? fd.get("skipWeekends") === "on" : true, dueOffsetDays: 0,
        startDate: isDayKey(due) ? due : todayKey(), endDate: null, assigneeId: assignee?.id || me.id,
        priority: PRIORITIES.includes(pr) ? pr : "MEDIUM", estimate: est !== null && est > 0 ? est : null,
        checklist: JSON.stringify(fd.getAll("st_title").map((x) => String(x).trim()).filter(Boolean)), active: true,
      },
    });
    await act(tx, me.id, "added recurring task", `${r.title} (${FREQ[freq]})`, null, p.id);
    return r;
  });
  const n = await generate({ ruleId: r.id, byId: me.id });
  return ok(`Recurring task created. ${n} upcoming ${n === 1 ? "occurrence" : "occurrences"} scheduled`, { href: `/projects/${p.id}` });
}

export async function createTask(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const title = str(fd, "title");
    if (!title) refuse("Give the task a title.");
    const pid = opt(fd, "projectId");
    const project = pid ? await prisma.project.findUnique({ where: { id: pid }, select: { id: true, line: true, leadId: true, status: true, name: true } }) : null;
    if (pid && !project) refuse("That project was deleted.");
    const freq = str(fd, "frequency") || "ONCE";
    if (freq !== "ONCE") return createRecurring(me, fd, project, freq);
    const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
    const activeIds = new Set(users.map((u) => u.id));
    const want = opt(fd, "assigneeId");
    const assigneeId = isLeadOrAdmin(me) && want && activeIds.has(want) ? want : me.id;
    const cat = str(fd, "category");
    const category = LINES.includes(cat) ? cat : project?.line || "GENERAL";
    const pr = str(fd, "priority");
    const priority = PRIORITIES.includes(pr) ? pr : "MEDIUM";
    const due = str(fd, "dueDate");
    const dueDate = isDayKey(due) ? due : todayKey();
    const est = int(fd, "estimate");
    const collab = [...new Set(list(fd, "collab"))].filter((x) => x !== assigneeId && activeIds.has(x));
    const titles = fd.getAll("st_title").map((x) => String(x).trim()), who = fd.getAll("st_assignee").map((x) => String(x));
    const subs = titles.map((t, i) => ({ title: t, assigneeId: who[i] && activeIds.has(who[i]) ? who[i] : null })).filter((s) => s.title);
    const id = await prisma.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          title, description: str(fd, "description"), projectId: pid, assigneeId, createdById: me.id, frequency: "ONCE", category, status: "TODO", priority, dueDate,
          estimate: est !== null && est > 0 ? est : null,
          collaborators: { create: collab.map((userId) => ({ userId })) },
          subtasks: { create: subs.map((s, i) => ({ title: s.title, assigneeId: s.assigneeId, sortOrder: i })) },
        },
      });
      await act(tx, me.id, "created task", t.title, t.id, pid);
      await notify(tx, assigneeId, "ASSIGNED", `${me.name} assigned you a task`, t.title, link(t.id), me.id);
      for (const c of collab) await notify(tx, c, "ASSIGNED", `${me.name} added you to a task`, t.title, link(t.id), me.id);
      for (const s of subs) await notify(tx, s.assigneeId, "ASSIGNED", `${me.name} gave you a subtask`, `${s.title} in ${t.title}`, link(t.id), me.id);
      return t.id;
    });
    return ok("Task created", { href: link(id) });
  });
}

export async function editTask(p: Result, fd: FormData): Promise<Result> {
  if (str(fd, "intent") === "delete") return deleteTask(p, fd);
  return run(async (me) => {
    await prisma.$transaction(async (tx) => {
      const t = await editable(tx, me, str(fd, "id"));
      const ch: string[] = [];
      const due = str(fd, "dueDate");
      const nd = isDayKey(due) ? due : t.dueDate;
      if (nd !== t.dueDate) ch.push("due " + fmtDate(nd));
      const pr = str(fd, "priority");
      const priority = PRIORITIES.includes(pr) ? pr : t.priority;
      if (priority !== t.priority) ch.push("priority " + PRIORITY[priority].toLowerCase());
      let assigneeId = t.assigneeId;
      const na = opt(fd, "assigneeId");
      if (na && na !== t.assigneeId && canReassign(me, like(t), t.project)) {
        const nu = await tx.user.findUnique({ where: { id: na }, select: { name: true, active: true } });
        if (!nu || !nu.active) refuse("Pick an active person.");
        assigneeId = na;
        ch.push("assigned to " + nu!.name);
        await notify(tx, na, "ASSIGNED", `${me.name} assigned you a task`, str(fd, "title") || t.title, link(t.id), me.id);
        await tx.taskCollaborator.deleteMany({ where: { taskId: t.id, userId: na } });
      }
      const cat = str(fd, "category");
      const est = int(fd, "estimate");
      await tx.task.update({
        where: { id: t.id },
        data: { title: str(fd, "title") || t.title, description: str(fd, "description"), dueDate: nd, priority, category: LINES.includes(cat) ? cat : t.category, estimate: est !== null && est > 0 ? est : null, assigneeId },
      });
      await act(tx, me.id, "edited task", ch.join(", "), t.id, t.projectId);
    });
    return ok("Changes saved");
  });
}

export async function deleteTask(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    if (!canDelete(me)) refuse("Only admins can delete tasks. Use Cancelled to close work that is no longer needed.");
    const pid = await prisma.$transaction(async (tx) => {
      const t = await getTask(tx, str(fd, "id"));
      await tx.task.delete({ where: { id: t.id } });
      await act(tx, me.id, "deleted task", t.title, null, t.projectId);
      return t.projectId;
    });
    return ok("Task deleted", { href: pid ? `/projects/${pid}` : "/tasks" });
  });
}

// ============ subtasks ============

export async function addSubtask(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const title = str(fd, "title");
    if (!title) refuse("Give the subtask a title.");
    await prisma.$transaction(async (tx) => {
      const t = await editable(tx, me, str(fd, "id"));
      const aid = opt(fd, "assigneeId");
      const last = await tx.subtask.findFirst({ where: { taskId: t.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      await tx.subtask.create({ data: { taskId: t.id, title, assigneeId: aid, sortOrder: (last?.sortOrder ?? -1) + 1 } });
      await notify(tx, aid, "ASSIGNED", `${me.name} gave you a subtask`, `${title} in ${t.title}`, link(t.id), me.id);
      await act(tx, me.id, "added subtask", title, t.id, t.projectId);
    });
    return ok("Subtask added");
  });
}

async function subOf(tx: Tx, id: string) {
  const s = await tx.subtask.findUnique({ where: { id } });
  if (!s) refuse("This subtask was removed.");
  return s!;
}

/** Form field: id (the subtask). The subtask's assignee or anyone who can edit the task. */
export async function toggleSubtask(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const done = await prisma.$transaction(async (tx) => {
      const s = await subOf(tx, str(fd, "id"));
      const t = await getTask(tx, s.taskId);
      if (!(canEdit(me, like(t), t.project) || s.assigneeId === me.id)) refuse("You cannot change this subtask.");
      const done = !s.done;
      await tx.subtask.update({ where: { id: s.id }, data: { done } });
      await act(tx, me.id, done ? "completed subtask" : "reopened subtask", s.title, t.id, t.projectId);
      if (done && t.status === "TODO") await tx.task.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
      return done;
    });
    return ok(done ? "Subtask done" : "Subtask reopened");
  });
}

/** Form fields: id (the subtask), assigneeId. */
export async function assignSubtask(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    await prisma.$transaction(async (tx) => {
      const s = await subOf(tx, str(fd, "id"));
      const t = await editable(tx, me, s.taskId);
      const aid = opt(fd, "assigneeId");
      await tx.subtask.update({ where: { id: s.id }, data: { assigneeId: aid } });
      await notify(tx, aid, "ASSIGNED", `${me.name} gave you a subtask`, `${s.title} in ${t.title}`, link(t.id), me.id);
      await act(tx, me.id, "assigned subtask", `${s.title} to ${(await userName(tx, aid)) || "no one"}`, t.id, t.projectId);
    });
    return ok("Subtask assigned");
  });
}

/** Form field: id (the subtask). */
export async function removeSubtask(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    await prisma.$transaction(async (tx) => {
      const s = await subOf(tx, str(fd, "id"));
      const t = await editable(tx, me, s.taskId);
      await tx.subtask.delete({ where: { id: s.id } });
      await act(tx, me.id, "removed subtask", s.title, t.id, t.projectId);
    });
    return ok("Subtask removed");
  });
}

// ============ dependencies and approvals ============

/** Form fields: id (the waiting task), dep (the task it waits on). */
export async function addDependency(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    await prisma.$transaction(async (tx) => {
      const t = await editable(tx, me, str(fd, "id"));
      if (closed(t.status)) refuse("This task is closed. Reopen it first.");
      const d = await tx.task.findUnique({ where: { id: str(fd, "dep") }, select: { id: true, title: true, status: true, projectId: true, assigneeId: true } });
      if (!d || d.id === t.id) refuse("Pick a task to link.");
      const dep = d!;
      if (t.projectId ? dep.projectId !== t.projectId : dep.assigneeId !== t.assigneeId) refuse("Link a task from the same project, or for the same person when there is no project.");
      if (closed(dep.status)) refuse("That task is already closed.");
      const exists = await tx.taskDependency.findUnique({ where: { taskId_dependsOnId: { taskId: t.id, dependsOnId: dep.id } } });
      if (exists) refuse("These tasks are already linked.");
      // Refuse loops: walk everything the new blocker waits on, directly or through others.
      const seen = new Set<string>([dep.id]);
      let front = [dep.id];
      while (front.length) {
        const rows = await tx.taskDependency.findMany({ where: { taskId: { in: front } }, select: { dependsOnId: true } });
        front = [];
        for (const r of rows) {
          if (r.dependsOnId === t.id) refuse(`"${dep.title}" already waits on this task, so they would wait on each other.`);
          if (!seen.has(r.dependsOnId)) { seen.add(r.dependsOnId); front.push(r.dependsOnId); }
        }
      }
      await tx.taskDependency.create({ data: { taskId: t.id, dependsOnId: dep.id } });
      await act(tx, me.id, "added dependency", dep.title, t.id, t.projectId);
      if (!closed(dep.status) && !closed(t.status)) await tx.task.update({ where: { id: t.id }, data: { status: "WAITING" } });
    });
    return ok("Dependency added. Status set to Waiting on dependency");
  });
}

/** Form fields: id (the waiting task), dep. */
export async function removeDependency(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    await prisma.$transaction(async (tx) => {
      const t = await editable(tx, me, str(fd, "id"));
      const depId = str(fd, "dep");
      const d = await tx.task.findUnique({ where: { id: depId }, select: { title: true } });
      await tx.taskDependency.deleteMany({ where: { taskId: t.id, dependsOnId: depId } });
      await unwait(tx, t);
      await act(tx, me.id, "removed dependency", d?.title || "", t.id, t.projectId);
    });
    return ok("Dependency removed");
  });
}

/** Form fields: id (the task), userId (approver), note. */
export async function requestApproval(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const note = str(fd, "note");
    if (!note) refuse("Say what needs approval.");
    const name = await prisma.$transaction(async (tx) => {
      const t = await editable(tx, me, str(fd, "id"));
      if (closed(t.status)) refuse("This task is closed. Reopen it first.");
      const who = await tx.user.findUnique({ where: { id: str(fd, "userId") }, select: { id: true, name: true, active: true } });
      if (!who || !who.active) refuse("Pick the person who must approve.");
      if (who!.id === me.id) refuse("Ask someone else to approve.");
      await tx.taskApproval.create({ data: { taskId: t.id, approverId: who!.id, requestedById: me.id, note } });
      if (!closed(t.status)) await tx.task.update({ where: { id: t.id }, data: { status: "WAITING" } });
      await notify(tx, who!.id, "APPROVAL", `${me.name} needs your approval`, `${note} on ${t.title}`, link(t.id), me.id);
      await act(tx, me.id, "requested approval", `${who!.name}: ${note}`, t.id, t.projectId);
      return who!.name;
    });
    return ok(`Approval requested from ${name}`);
  });
}

/** Form fields: id (the approval), status (APPROVED or REJECTED). The approver or an admin. */
export async function decideApproval(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const status = str(fd, "status") === "APPROVED" ? "APPROVED" : "REJECTED";
    await prisma.$transaction(async (tx) => {
      const a = await tx.taskApproval.findUnique({ where: { id: str(fd, "id") }, include: { task: { select: { id: true, title: true, status: true, projectId: true, assigneeId: true } } } });
      if (!a) refuse("This approval request was removed.");
      const ap = a!;
      if (ap.approverId !== me.id && !isAdmin(me)) refuse("Only the person asked, or an admin, can decide this.");
      if (ap.status !== "PENDING") refuse("This request was already decided.");
      const t = ap.task;
      await tx.taskApproval.update({ where: { id: ap.id }, data: { status, decidedAt: new Date() } });
      await act(tx, me.id, status === "APPROVED" ? "approved" : "rejected", ap.note || "approval request", t.id, t.projectId);
      await notify(tx, t.assigneeId, "APPROVAL", `${me.name} ${status === "APPROVED" ? "approved" : "rejected"}: ${t.title}`, ap.note, link(t.id), me.id);
      await tx.notification.updateMany({ where: { userId: me.id, kind: "APPROVAL", link: link(t.id), readAt: null }, data: { readAt: new Date() } });
      if (status === "APPROVED" && (await unwait(tx, t))) await act(tx, me.id, "dependency cleared", "all approvals received", t.id, t.projectId);
    });
    return ok(status === "APPROVED" ? "Approved" : "Rejected");
  });
}

/** Form field: id (the approval). */
export async function removeApproval(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    await prisma.$transaction(async (tx) => {
      const a = await tx.taskApproval.findUnique({ where: { id: str(fd, "id") }, select: { id: true, taskId: true } });
      if (!a) refuse("This approval request was removed.");
      const t = await editable(tx, me, a!.taskId);
      await tx.taskApproval.delete({ where: { id: a!.id } });
      await unwait(tx, t);
    });
    return ok("Approval removed");
  });
}

// ============ people ============

/** Form fields: id (the task), userId. */
export async function addCollaborator(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const uid = str(fd, "userId");
    if (!uid) refuse("Pick a person first");
    await prisma.$transaction(async (tx) => {
      const t = await editable(tx, me, str(fd, "id"));
      const x = await tx.user.findUnique({ where: { id: uid }, select: { id: true, name: true, active: true } });
      if (!x || !x.active) refuse("Pick a person first");
      if (x!.id === t.assigneeId || t.collaborators.some((c) => c.userId === x!.id)) return;
      await tx.taskCollaborator.create({ data: { taskId: t.id, userId: x!.id } });
      await notify(tx, x!.id, "ASSIGNED", `${me.name} added you to a task`, t.title, link(t.id), me.id);
      await act(tx, me.id, "added collaborator", x!.name, t.id, t.projectId);
    });
    return ok("Collaborator added");
  });
}

/** Form fields: id (the task), userId. */
export async function removeCollaborator(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    await prisma.$transaction(async (tx) => {
      const t = await editable(tx, me, str(fd, "id"));
      await tx.taskCollaborator.deleteMany({ where: { taskId: t.id, userId: str(fd, "userId") } });
    });
    return ok("Collaborator removed");
  });
}

// ============ discussion and time ============

/** Form fields: id (the task), body. */
export async function addComment(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const body = str(fd, "body");
    if (!body) refuse("Write a comment first.");
    const users = await loadUsers();
    const ment = mentionedUsers(body, users).filter((x) => x.id !== me.id);
    await prisma.$transaction(async (tx) => {
      const t = await getTask(tx, str(fd, "id"));
      await tx.comment.create({ data: { taskId: t.id, userId: me.id, body } });
      await act(tx, me.id, "commented", body.slice(0, 120), t.id, t.projectId);
      for (const x of ment) await notify(tx, x.id, "MENTION", `${me.name} mentioned you on ${t.title}`, body, link(t.id), me.id);
      if (t.assigneeId !== me.id && !ment.some((x) => x.id === t.assigneeId)) await notify(tx, t.assigneeId, "UPDATE", `${me.name} commented on ${t.title}`, body, link(t.id), me.id);
    });
    return ok(ment.length ? `Comment posted. ${ment.map((x) => x.name.split(" ")[0]).join(", ")} notified` : "Comment posted");
  });
}

/** Form fields: id (the task), hours, minutes, on, note. */
export async function logTime(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const h = parseFloat(str(fd, "hours")) || 0, mm = parseInt(str(fd, "minutes"), 10) || 0;
    const m = Math.round(h * 60 + mm);
    if (m <= 0 || m > 1440) refuse("Enter between 1 minute and 24 hours");
    const on = str(fd, "on");
    await prisma.$transaction(async (tx) => {
      const t = await editable(tx, me, str(fd, "id"));
      await tx.timeLog.create({ data: { taskId: t.id, userId: me.id, minutes: m, workDate: isDayKey(on) ? on : todayKey(), note: str(fd, "note") } });
      await tx.task.update({ where: { id: t.id }, data: { spentMinutes: { increment: m }, ...(t.status === "TODO" ? { status: "IN_PROGRESS" } : {}) } });
      await act(tx, me.id, "logged time", mins(m), t.id, t.projectId);
    });
    return ok(mins(m) + " logged");
  });
}
