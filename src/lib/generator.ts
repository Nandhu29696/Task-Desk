import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { addK, fmtDate, inr, diffK, todayKey } from "./dates";
import { RENEW_LINES, SVC, closed } from "./constants";
import { loadCal, parseJson } from "./model";
import { LOOKAHEAD, occurrences, scheduleDate } from "./recurrence";
import { act, notify } from "./log";
import { closeStaleSessions } from "./sessions";
import { releaseDependents } from "./taskops";

type GenOpts = { ruleId?: string; projectId?: string; byId?: string | null };

/** A unique key clash: another run (cron, a page load) already created the same row. */
const isDuplicate = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

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
      try {
        await prisma.task.create({
          data: {
            title: r.title, description: r.description || "", projectId: r.projectId, assigneeId, ruleId: r.id, occurrenceDate: occ, frequency: r.frequency, category: r.category, priority: r.priority, dueDate: due, estimate: r.estimate,
            subtasks: { create: checklist.map((title, i) => ({ title, sortOrder: i })) },
          },
        });
      } catch (e) {
        if (isDuplicate(e)) continue; // created by a run at the same time
        throw e;
      }
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

/**
 * Cancels open renewal reminders that no longer match a service: the service was removed,
 * or its renewal date was changed in the client form instead of with "Renewed for 1 year".
 * The key is cleared so a reminder can be created again if the date is set back.
 */
export async function cancelStaleRenewals(byId: string | null = null) {
  const open = await prisma.task.findMany({ where: { renewKey: { not: null }, status: { notIn: ["DONE", "CANCELLED"] } }, select: { id: true, title: true, status: true, renewKey: true, projectId: true } });
  if (!open.length) return 0;
  const ids = [...new Set(open.map((t) => t.renewKey!.split(":")[0]))];
  const services = new Map((await prisma.clientService.findMany({ where: { id: { in: ids } }, select: { id: true, renewDate: true } })).map((s) => [s.id, s.renewDate]));
  let n = 0;
  for (const t of open) {
    const [sid, date] = t.renewKey!.split(":");
    const current = services.get(sid);
    if (current !== undefined && current === date) continue;
    await prisma.$transaction(async (tx) => {
      const x = await tx.task.update({ where: { id: t.id }, data: { status: "CANCELLED", cancelledAt: new Date(), renewKey: null } });
      await act(tx, byId, "renewal reminder cancelled", current === undefined ? `${t.title}: the service was removed` : `${t.title}: renewal date changed to ${current ? fmtDate(current) : "none"}`, t.id, t.projectId);
      if (closed(x.status)) await releaseDependents(tx, x, byId);
    });
    n++;
  }
  return n;
}

/** 30 days before a domain, hosting or AMC renewal, create one reminder task for the client owner. */
export async function renewalReminders() {
  await cancelStaleRenewals();
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
    let task;
    try {
      task = await prisma.task.create({
        data: {
          title: `Renew ${what} ${s.item || ""} for ${c.name}`.replace(/\s+/g, " ").trim(),
          description: `${SVC[s.line]} ${s.item || ""} ${s.provider ? "with " + s.provider : ""} renews on ${fmtDate(s.renewDate)} for ${inr(s.price)}. Confirm with the client, renew, then click "Renewed for 1 year" on the client page.`.replace(/\s+/g, " "),
          projectId: c.projects[0]?.id || null, assigneeId: c.ownerId, renewKey: key, frequency: "ONCE", category: "WEBDEV", priority: days <= 7 ? "URGENT" : "HIGH", dueDate: due, estimate: 20,
          subtasks: { create: [{ title: "Confirm with the client", sortOrder: 0 }, { title: "Renew with the provider", sortOrder: 1 }, { title: "Update the renewal date in TaskDesk", sortOrder: 2 }] },
        },
      });
    } catch (e) {
      if (isDuplicate(e)) continue; // created by a run at the same time
      throw e;
    }
    await act(prisma, null, "renewal reminder created", `${SVC[s.line]} ${s.item || ""} for ${c.name}, renews ${fmtDate(s.renewDate)}`, null, c.projects[0]?.id || null);
    await notify(prisma, c.ownerId, "RENEWAL", `${SVC[s.line]} renewal in ${days} days`, `${s.item || ""} for ${c.name} renews on ${fmtDate(s.renewDate)}`, `/tasks/${task.id}`);
    n++;
  }
  return n;
}

const JOB_KEY = "lastJob";
const JOB_GAP = 30 * 60 * 1000;

/**
 * Claims the next daily job run. Only one caller wins: the stored time is swapped
 * only if nobody changed it since it was read (compare and swap on the settings row).
 * With `force` (cron) the 30 minute gap is skipped, but two runs still cannot overlap a claim.
 */
async function claimJob(force: boolean) {
  const now = new Date().toISOString();
  const row = await prisma.setting.findUnique({ where: { key: JOB_KEY } });
  if (!row) {
    try { await prisma.setting.create({ data: { key: JOB_KEY, value: JSON.stringify(now) } }); return true; }
    catch (e) { if (isDuplicate(e)) return false; throw e; }
  }
  const last = Date.parse(parseJson<string>(row.value, ""));
  if (!force && last && Date.now() - last < JOB_GAP) return false;
  const won = await prisma.setting.updateMany({ where: { key: JOB_KEY, value: row.value }, data: { value: JSON.stringify(now) } });
  return won.count === 1;
}

/** The daily job: safe to run again, every step skips work already done. */
export async function runDailyJob() {
  if (!(await claimJob(true))) return { tasksCreated: 0, remindersCreated: 0, sessionsClosed: 0, skipped: true };
  const sessionsClosed = await closeStaleSessions();
  const tasksCreated = await generate();
  const remindersCreated = await renewalReminders();
  return { tasksCreated, remindersCreated, sessionsClosed, skipped: false };
}

/** Light fallback when no cron is set up: run the daily job at most once every 30 minutes when someone opens the app. */
export async function maybeRunDailyJob() {
  try {
    if (!(await claimJob(false))) return;
    await closeStaleSessions();
    await generate();
    await renewalReminders();
  } catch (e) { console.error("Daily job failed", e); }
}
