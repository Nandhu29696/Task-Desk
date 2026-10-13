import { prisma } from "./db";
import { addK, fmtDate, inr, diffK, todayKey } from "./dates";
import { RENEW_LINES, SVC } from "./constants";
import { loadCal, parseJson, saveSetting } from "./model";
import { LOOKAHEAD, occurrences, scheduleDate } from "./recurrence";
import { act, notify } from "./log";
import { closeStaleSessions } from "./sessions";

type GenOpts = { ruleId?: string; projectId?: string; byId?: string | null };

/**
 * Creates real tasks for every active rule on an active project, up to LOOKAHEAD days ahead.
 * Never creates a second task for the same rule and occurrence date. Safe to run any number of times.
 */
export async function generate(opts: GenOpts = {}) {
  const t0 = todayKey(), horizon = addK(t0, LOOKAHEAD);
  const cal = await loadCal();
  const rules = await prisma.recurringRule.findMany({
    where: { active: true, ...(opts.ruleId ? { id: opts.ruleId } : {}), ...(opts.projectId ? { projectId: opts.projectId } : {}), project: { status: "ACTIVE" } },
    include: { project: { select: { leadId: true, name: true } } },
  });
  let n = 0;
  const perPerson = new Map<string, number>();
  for (const r of rules) {
    let from: string;
    if (r.frequency === "ONCE") { if (r.generatedThrough) continue; from = addK(r.startDate, r.dueOffsetDays || 0); }
    else if (r.generatedThrough) { from = addK(r.generatedThrough, 1); const floor = addK(t0, -7); if (from < floor) from = floor; }
    else from = r.startDate > t0 ? r.startDate : t0;
    const to = r.frequency === "ONCE" ? from : horizon;
    const assigneeId = r.assigneeId || r.project.leadId || null;
    const occs = occurrences(cal, r, from, to);
    const existing = new Set((await prisma.task.findMany({ where: { ruleId: r.id, occurrenceDate: { in: occs } }, select: { occurrenceDate: true } })).map((x) => x.occurrenceDate));
    const checklist = parseJson<string[]>(r.checklist, []);
    for (const occ of occs) {
      if (existing.has(occ)) continue;
      const due = scheduleDate(cal, r, occ); if (!due) continue;
      await prisma.task.create({
        data: {
          title: r.title, description: r.description || "", projectId: r.projectId, assigneeId, ruleId: r.id, occurrenceDate: occ, frequency: r.frequency, category: r.category, priority: r.priority, dueDate: due, estimate: r.estimate,
          subtasks: { create: checklist.map((title, i) => ({ title, sortOrder: i })) },
        },
      });
      n++;
      if (assigneeId) perPerson.set(assigneeId, (perPerson.get(assigneeId) || 0) + 1);
    }
    await prisma.recurringRule.update({ where: { id: r.id }, data: { generatedThrough: r.frequency === "ONCE" ? from : horizon } });
  }
  for (const [uid, c] of perPerson) await notify(prisma, uid, "ASSIGNED", `${c} new ${c === 1 ? "task" : "tasks"} for the coming days`, "Created from recurring tasks on your projects.", "/tasks", opts.byId || null);
  return n;
}

/** A task nobody has started: To do, no time, no comments, no ticked subtasks, no dependencies. */
export const untouchedWhere = { status: "TODO", spentMinutes: 0, comments: { none: {} }, subtasks: { none: { done: true } }, dependsOn: { none: {} } };

/** After a rule edit: replace its future untouched tasks and generate again. */
export async function resetRuleFuture(ruleId: string, byId: string | null = null) {
  const t0 = todayKey();
  const r = await prisma.recurringRule.findUnique({ where: { id: ruleId } });
  if (!r) return 0;
  await prisma.task.deleteMany({ where: { ruleId, dueDate: { gt: t0 }, ...untouchedWhere } });
  if (r.frequency === "ONCE") {
    const ex = await prisma.task.findFirst({ where: { ruleId } });
    if (ex) {
      const due = addK(r.startDate, r.dueOffsetDays || 0);
      await prisma.task.update({ where: { id: ex.id }, data: { title: r.title, description: r.description || "", priority: r.priority, estimate: r.estimate, dueDate: due, ...(r.assigneeId ? { assigneeId: r.assigneeId } : {}) } });
      await prisma.recurringRule.update({ where: { id: ruleId }, data: { generatedThrough: due } });
      return 0;
    }
    await prisma.recurringRule.update({ where: { id: ruleId }, data: { generatedThrough: null } });
  } else await prisma.recurringRule.update({ where: { id: ruleId }, data: { generatedThrough: t0 } });
  return r.active ? generate({ ruleId, byId }) : 0;
}

/** After holidays or weekly offs change: move every future untouched rule task to the right date. */
export async function rescheduleAll() {
  const t0 = todayKey();
  await prisma.task.deleteMany({ where: { ruleId: { not: null }, dueDate: { gt: t0 }, ...untouchedWhere } });
  const rules = await prisma.recurringRule.findMany({ select: { id: true, frequency: true, generatedThrough: true } });
  for (const r of rules) {
    if (r.frequency === "ONCE") {
      const has = await prisma.task.count({ where: { ruleId: r.id } });
      if (!has) await prisma.recurringRule.update({ where: { id: r.id }, data: { generatedThrough: null } });
    } else if (r.generatedThrough && r.generatedThrough > t0) await prisma.recurringRule.update({ where: { id: r.id }, data: { generatedThrough: t0 } });
  }
  return generate();
}

/** 30 days before a domain, hosting or AMC renewal, create one reminder task for the client owner. */
export async function renewalReminders() {
  const t0 = todayKey(), limit = addK(t0, 30);
  const services = await prisma.clientService.findMany({
    where: { line: { in: RENEW_LINES }, renewDate: { gte: t0, lte: limit }, client: { stage: { not: "CHURNED" } } },
    include: { client: { include: { projects: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 } } } },
  });
  let n = 0;
  for (const s of services) {
    if (s.completedDate && s.completedDate < t0) continue;
    const key = s.id + ":" + s.renewDate;
    if (await prisma.task.findUnique({ where: { renewKey: key } })) continue;
    const c = s.client;
    const days = diffK(s.renewDate, t0);
    const due = addK(s.renewDate, -30) > t0 ? addK(s.renewDate, -30) : t0;
    const what = s.line === "AMC" ? "website AMC" : SVC[s.line].toLowerCase();
    const task = await prisma.task.create({
      data: {
        title: `Renew ${what} ${s.item || ""} for ${c.name}`.replace(/\s+/g, " ").trim(),
        description: `${SVC[s.line]} ${s.item || ""} ${s.provider ? "with " + s.provider : ""} renews on ${fmtDate(s.renewDate)} for ${inr(s.price)}. Confirm with the client, renew, then click "Renewed for 1 year" on the client page.`.replace(/\s+/g, " "),
        projectId: c.projects[0]?.id || null, assigneeId: c.ownerId, renewKey: key, frequency: "ONCE", category: "WEBDEV", priority: days <= 7 ? "URGENT" : "HIGH", dueDate: due, estimate: 20,
        subtasks: { create: [{ title: "Confirm with the client", sortOrder: 0 }, { title: "Renew with the provider", sortOrder: 1 }, { title: "Update the renewal date in TaskDesk", sortOrder: 2 }] },
      },
    });
    await act(prisma, null, "renewal reminder created", `${SVC[s.line]} ${s.item || ""} for ${c.name}, renews ${fmtDate(s.renewDate)}`, null, c.projects[0]?.id || null);
    await notify(prisma, c.ownerId, "RENEWAL", `${SVC[s.line]} renewal in ${days} days`, `${s.item || ""} for ${c.name} renews on ${fmtDate(s.renewDate)}`, `/tasks/${task.id}`);
    n++;
  }
  return n;
}

/** The daily job: safe to run again, every step skips work already done. */
export async function runDailyJob() {
  const sessionsClosed = await closeStaleSessions();
  const tasksCreated = await generate();
  const remindersCreated = await renewalReminders();
  await saveSetting("lastJob" as never, new Date().toISOString());
  return { tasksCreated, remindersCreated, sessionsClosed };
}

/** Light fallback when no cron is set up: run the daily job at most once every 30 minutes when someone opens the app. */
export async function maybeRunDailyJob() {
  const row = await prisma.setting.findUnique({ where: { key: "lastJob" } });
  const last = row ? Date.parse(parseJson<string>(row.value, "")) : 0;
  if (last && Date.now() - last < 30 * 60 * 1000) return;
  await saveSetting("lastJob" as never, new Date().toISOString());
  try { await runDailyJob(); } catch (e) { console.error("Daily job failed", e); }
}
