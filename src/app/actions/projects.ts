"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FREQ, FREQS, INDUSTRIES, LINES, PRIORITIES, PSTATUS, TEMPLATES, COMMS, type Template } from "@/lib/constants";
import { isDayKey, todayKey } from "@/lib/dates";
import { canManage, isAdmin, isLeadOrAdmin } from "@/lib/permissions";
import { generate, resetRuleFuture } from "@/lib/generator";
import { act, notifyMany } from "@/lib/log";
import { bool, int, list, ok, opt, refuse, run, str, type Result } from "@/lib/action";

type RuleData = Omit<Prisma.RecurringRuleUncheckedCreateInput, "projectId">;

const NOT_MANAGER = "Only the project lead or an admin can change this project.";

/** A task nobody has started (same rule as the generator): To do, no time, no comments, no ticked subtasks, no dependencies. */
const untouchedWhere = { status: "TODO", spentMinutes: 0, comments: { none: {} }, subtasks: { none: { done: true } }, dependsOn: { none: {} } } satisfies Prisma.TaskWhereInput;

const clampDay = (n: number | null) => Math.min(31, Math.max(1, n ?? 1));
const oneOf = (v: string, allowed: string[], fallback: string) => (allowed.includes(v) ? v : fallback);

async function activeUserIds(ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Set<string>();
  const rows = await prisma.user.findMany({ where: { id: { in: want }, active: true }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}
async function validAssignee(id: string | null) {
  if (!id) return null;
  return (await activeUserIds([id])).has(id) ? id : null;
}

/** Port of the preview's ruleFromForm. Field names come from RuleFields. */
async function ruleFromForm(fd: FormData): Promise<RuleData> {
  const f = oneOf(str(fd, "frequency"), FREQS, "WEEKLY");
  const start = str(fd, "startDate");
  const endDate = str(fd, "endDate");
  return {
    title: str(fd, "title"),
    description: str(fd, "description"),
    category: oneOf(str(fd, "category"), LINES, "GENERAL"),
    frequency: f,
    weekday: f === "WEEKLY" ? Math.min(6, Math.max(0, int(fd, "weekday") ?? 1)) : null,
    monthDay: f === "MONTHLY" || f === "QUARTERLY" ? clampDay(int(fd, "monthDay")) : null,
    skipWeekends: f === "DAILY" ? bool(fd, "skipWeekends") : true,
    dueOffsetDays: f === "ONCE" ? Math.min(365, Math.max(0, int(fd, "dueOffsetDays") ?? 0)) : 0,
    startDate: isDayKey(start) ? start : todayKey(),
    endDate: isDayKey(endDate) ? endDate : null,
    assigneeId: await validAssignee(opt(fd, "assigneeId")),
    priority: oneOf(str(fd, "priority"), PRIORITIES, "MEDIUM"),
    estimate: (() => { const e = int(fd, "estimate"); return e === null ? null : Math.max(0, e); })(),
    checklist: JSON.stringify(str(fd, "checklist").split("\n").map((s) => s.trim()).filter(Boolean)),
  };
}

/** Port of the preview's ruleFromTemplate. */
function ruleFromTemplate(t: Template, startDate: string, assigneeId: string | null): RuleData {
  return {
    title: t.title, description: t.description, category: t.line, frequency: t.frequency, weekday: t.weekday, monthDay: t.monthDay, skipWeekends: true,
    dueOffsetDays: t.dueOffsetDays, startDate, endDate: null, assigneeId, priority: t.priority, estimate: t.est, checklist: JSON.stringify(t.checklist), active: true,
  };
}

async function managedProject(me: { id: string; role: string }, id: string) {
  const p = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, leadId: true, status: true } });
  if (!p) refuse("This project was deleted.");
  if (!canManage(me, p)) refuse(NOT_MANAGER);
  return p!;
}
async function managedRule(me: { id: string; role: string }, id: string) {
  const r = await prisma.recurringRule.findUnique({ where: { id }, include: { project: { select: { id: true, leadId: true } } } });
  if (!r) refuse("This recurring task was deleted.");
  if (!canManage(me, r!.project)) refuse("Only the project lead or an admin can change these.");
  return r!;
}

function pocFrom(fd: FormData) {
  return { pocName: str(fd, "poc_name"), pocRole: str(fd, "poc_role"), pocPhone: str(fd, "poc_phone"), pocEmail: str(fd, "poc_email") };
}
const commsFrom = (fd: FormData) => list(fd, "comms").filter((c) => c in COMMS).join(",");

// ============ projects ============

export async function createProject(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    if (!isLeadOrAdmin(me)) refuse("Only leads and admins can create projects.");
    const name = str(fd, "name");
    if (!name) refuse("Add a project name.");
    let leadId = me.id;
    if (isAdmin(me) && str(fd, "leadId")) {
      const lead = await prisma.user.findFirst({ where: { id: str(fd, "leadId"), active: true, role: { in: ["ADMIN", "LEAD"] } }, select: { id: true } });
      if (!lead) refuse("Pick an active lead or admin as the project lead.");
      leadId = lead!.id;
    }
    let clientId: string | null = null;
    if (isAdmin(me) && str(fd, "clientId")) {
      const c = await prisma.client.findUnique({ where: { id: str(fd, "clientId") }, select: { id: true } });
      if (!c) refuse("That client was deleted.");
      clientId = c!.id;
    }
    const line = oneOf(str(fd, "line"), LINES, "GENERAL");
    const startDate = isDayKey(str(fd, "startDate")) ? str(fd, "startDate") : todayKey();
    const members = await activeUserIds([...list(fd, "m"), leadId]);
    members.add(leadId);

    const tplAssignee = await validAssignee(opt(fd, "tplAssignee"));
    const keys = list(fd, "tpl");
    const rules: RuleData[] = TEMPLATES.filter((t) => keys.includes(t.key)).map((t) => ruleFromTemplate(t, startDate, tplAssignee));
    // custom rows from "Your own recurring tasks"
    const titles = fd.getAll("rr_title").map(String), freqs = fd.getAll("rr_freq").map(String), wds = fd.getAll("rr_weekday").map(String), mds = fd.getAll("rr_monthday").map(String), ass = fd.getAll("rr_assignee").map(String);
    const rowAssignees = await activeUserIds(ass);
    titles.forEach((t, i) => {
      const title = t.trim(); if (!title) return;
      const f = oneOf(freqs[i] || "", FREQS.filter((x) => x !== "ONCE"), "WEEKLY");
      const wd = parseInt(wds[i] ?? "", 10), md = parseInt(mds[i] ?? "", 10);
      rules.push({
        title, description: "", category: line, frequency: f,
        weekday: f === "WEEKLY" ? (Number.isFinite(wd) ? Math.min(6, Math.max(0, wd)) : 1) : null,
        monthDay: f === "MONTHLY" || f === "QUARTERLY" ? clampDay(Number.isFinite(md) ? md : null) : null,
        skipWeekends: true, dueOffsetDays: 0, startDate, endDate: null, assigneeId: ass[i] && rowAssignees.has(ass[i]) ? ass[i] : null, priority: "MEDIUM", estimate: null, checklist: "[]", active: true,
      });
    });

    const industry = str(fd, "industry");
    const p = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          name, clientId, clientLabel: clientId ? null : str(fd, "clientLabel") || null, industry: INDUSTRIES.includes(industry) ? industry : null, line, website: str(fd, "website") || null,
          description: str(fd, "description") || null, status: "ACTIVE", leadId, startDate, ...pocFrom(fd), comms: commsFrom(fd),
          members: { create: [...members].map((userId) => ({ userId })) },
        },
      });
      if (rules.length) await tx.recurringRule.createMany({ data: rules.map((r) => ({ ...r, projectId: p.id })) });
      await act(tx, me.id, "created project", `${p.name} with ${rules.length} recurring tasks`, null, p.id);
      await notifyMany(tx, [...members], "ASSIGNED", `${me.name} added you to a project`, p.name, `/projects/${p.id}`, me.id);
      return p;
    });
    const n = await generate({ projectId: p.id, byId: me.id });
    return ok(`Project created with ${rules.length} recurring tasks. ${n} tasks scheduled`, { href: `/projects/${p.id}` });
  });
}

export async function saveProjectSettings(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const p = await managedProject(me, str(fd, "id"));
    const status = oneOf(str(fd, "status"), Object.keys(PSTATUS), p.status);
    const industry = str(fd, "industry");
    const data: Prisma.ProjectUncheckedUpdateInput = {
      name: str(fd, "name") || p.name, website: str(fd, "website") || null, line: oneOf(str(fd, "line"), LINES, "GENERAL"),
      status, description: str(fd, "description") || null, ...pocFrom(fd), comms: commsFrom(fd),
    };
    if (INDUSTRIES.includes(industry)) data.industry = industry;
    if (isAdmin(me)) {
      const cid = str(fd, "clientId");
      if (cid) {
        const c = await prisma.client.findUnique({ where: { id: cid }, select: { id: true } });
        if (!c) refuse("That client was deleted.");
        data.clientId = cid; data.clientLabel = null;
      } else { data.clientId = null; data.clientLabel = str(fd, "clientLabel") || null; }
    } else if (fd.has("clientLabel")) data.clientLabel = str(fd, "clientLabel") || null;
    let newLead: string | null = null;
    if (isAdmin(me) && str(fd, "leadId") && str(fd, "leadId") !== p.leadId) {
      const lead = await prisma.user.findFirst({ where: { id: str(fd, "leadId"), active: true, role: { in: ["ADMIN", "LEAD"] } }, select: { id: true } });
      if (!lead) refuse("Pick an active lead or admin as the project lead.");
      newLead = lead!.id; data.leadId = newLead;
    }
    await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: p.id }, data });
      if (newLead) {
        await tx.projectMember.upsert({ where: { projectId_userId: { projectId: p.id, userId: newLead } }, update: {}, create: { projectId: p.id, userId: newLead } });
        await notifyMany(tx, [newLead], "ASSIGNED", `${me.name} made you the lead of a project`, String(data.name), `/projects/${p.id}`, me.id);
      }
      if (status !== p.status) await act(tx, me.id, "changed project status", PSTATUS[status].toLowerCase(), null, p.id);
    });
    // Paused and archived projects stop creating tasks: the generator only runs rules of active projects.
    const n = status !== p.status && status === "ACTIVE" ? await generate({ projectId: p.id, byId: me.id }) : 0;
    return ok("Settings saved" + (n ? `. ${n} tasks created` : ""));
  });
}

export async function saveMembers(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const p = await managedProject(me, str(fd, "id"));
    const ids = await activeUserIds(list(fd, "m"));
    if (p.leadId) ids.add(p.leadId);
    const before = new Set((await prisma.projectMember.findMany({ where: { projectId: p.id }, select: { userId: true } })).map((m) => m.userId));
    await prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId: p.id, userId: { notIn: [...ids] } } });
      const add = [...ids].filter((id) => !before.has(id));
      if (add.length) await tx.projectMember.createMany({ data: add.map((userId) => ({ projectId: p.id, userId })) });
      await act(tx, me.id, "updated project members", ids.size + " members", null, p.id);
      await notifyMany(tx, add, "ASSIGNED", `${me.name} added you to a project`, p.name, `/projects/${p.id}`, me.id);
    });
    return ok("Team saved");
  });
}

// ============ recurring tasks ============

export async function addRule(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const p = await managedProject(me, str(fd, "id"));
    const v = await ruleFromForm(fd);
    if (!v.title) refuse("Add a task title.");
    const r = await prisma.$transaction(async (tx) => {
      const r = await tx.recurringRule.create({ data: { ...v, projectId: p.id, active: true } });
      await act(tx, me.id, "added recurring task", `${r.title} (${FREQ[r.frequency]})`, null, p.id);
      return r;
    });
    const n = await generate({ ruleId: r.id, byId: me.id });
    return ok(`Recurring task created. ${n} upcoming ${n === 1 ? "occurrence" : "occurrences"} scheduled`, { href: `/projects/${p.id}` });
  });
}

export async function editRule(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const r = await managedRule(me, str(fd, "id"));
    const v = await ruleFromForm(fd);
    await prisma.$transaction(async (tx) => {
      await tx.recurringRule.update({ where: { id: r.id }, data: { ...v, title: v.title || r.title } });
      await act(tx, me.id, "edited recurring task", v.title || r.title, null, r.projectId);
    });
    await resetRuleFuture(r.id, me.id);
    return ok("Saved. Future occurrences updated");
  });
}

export async function toggleRule(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const r = await managedRule(me, str(fd, "id"));
    if (r.active) {
      const today = todayKey();
      await prisma.$transaction(async (tx) => {
        await tx.task.deleteMany({ where: { ruleId: r.id, dueDate: { gt: today }, ...untouchedWhere } });
        const lost = r.frequency === "ONCE" && !(await tx.task.count({ where: { ruleId: r.id } }));
        await tx.recurringRule.update({ where: { id: r.id }, data: { active: false, generatedThrough: r.frequency !== "ONCE" ? today : lost ? null : r.generatedThrough } });
        await act(tx, me.id, "paused recurring task", r.title, null, r.projectId);
      });
      return ok("Paused. Future untouched occurrences removed");
    }
    await prisma.$transaction(async (tx) => {
      // A one time rule whose task was removed while paused must be generated again on resume.
      const lost = r.frequency === "ONCE" && !(await tx.task.count({ where: { ruleId: r.id } }));
      await tx.recurringRule.update({ where: { id: r.id }, data: { active: true, ...(lost ? { generatedThrough: null } : {}) } });
      await act(tx, me.id, "resumed recurring task", r.title, null, r.projectId);
    });
    const n = await generate({ ruleId: r.id, byId: me.id });
    return ok(`Resumed. ${n} tasks created`);
  });
}

export async function deleteRule(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const r = await managedRule(me, str(fd, "id"));
    const today = todayKey();
    await prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { ruleId: r.id, dueDate: { gt: today }, ...untouchedWhere } });
      await tx.task.updateMany({ where: { ruleId: r.id }, data: { ruleId: null } });
      await tx.recurringRule.delete({ where: { id: r.id } });
      await act(tx, me.id, "deleted recurring task", r.title, null, r.projectId);
    });
    return ok("Recurring task deleted. Past and started occurrences kept");
  });
}

export async function addTemplates(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const p = await managedProject(me, str(fd, "id"));
    const keys = list(fd, "tpl");
    if (!keys.length) refuse("Tick at least one template");
    const start = isDayKey(str(fd, "startDate")) ? str(fd, "startDate") : todayKey();
    const assigneeId = await validAssignee(opt(fd, "assigneeId"));
    const rs = TEMPLATES.filter((t) => keys.includes(t.key)).map((t) => ruleFromTemplate(t, start, assigneeId));
    if (!rs.length) refuse("Tick at least one template");
    await prisma.$transaction(async (tx) => {
      await tx.recurringRule.createMany({ data: rs.map((r) => ({ ...r, projectId: p.id })) });
      await act(tx, me.id, "added template recurring tasks", rs.length + " recurring tasks", null, p.id);
    });
    const n = await generate({ projectId: p.id, byId: me.id });
    return ok(`${rs.length} recurring tasks added. ${n} tasks scheduled`, { href: `/projects/${p.id}` });
  });
}
