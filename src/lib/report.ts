// Reports: period ranges, the report computation (port of the preview's buildReport) and the CSV export.
// buildReport is pure; loadReport reads only what the period needs from the database.
import { prisma } from "./db";
import { FORDER, FREQ, LINE, PRIORITY, STATUS, closed } from "./constants";
import { addK, addMonths, fmtDate, fmtMon, fmtMonth, fmtShort, fromLocal, isDayKey, kd, startOfWeek } from "./dates";
import { workingDays, type CalLike } from "./calendar";
import { sessionMinutes } from "./attendance";
import { sortTasks } from "./logic";
import { isLeadOrAdmin } from "./permissions";
import { loadLeaves, loadProjects, loadSessions, loadTasks, type Leave, type P, type Sess, type T, type U } from "./model";

export type Period = "DAY" | "WEEK" | "MONTH" | "QUARTER";
export const PERIODS: Period[] = ["DAY", "WEEK", "MONTH", "QUARTER"];
export const PERIOD_WORD: Record<Period, string> = { DAY: "day", WEEK: "week", MONTH: "month", QUARTER: "quarter" };
export type Range = { start: string; end: string; label: string; period: Period };

const fmtLongY = (k: string) => kd(k).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The period containing `anchor`. `end` is exclusive. */
export function rangeFor(period: Period, anchor: string): Range {
  if (period === "DAY") return { start: anchor, end: addK(anchor, 1), label: fmtLongY(anchor), period };
  if (period === "WEEK") { const s = startOfWeek(anchor); return { start: s, end: addK(s, 7), label: `Week of ${fmtDate(s)}`, period }; }
  if (period === "QUARTER") {
    const y = +anchor.slice(0, 4), q = Math.floor((+anchor.slice(5, 7) - 1) / 3);
    const s = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
    return { start: s, end: addMonths(s, 3), label: `Q${q + 1} ${y}, ${fmtMon(s)} to ${fmtMon(addMonths(s, 2))}`, period };
  }
  const s = anchor.slice(0, 7) + "-01";
  return { start: s, end: addMonths(s, 1), label: fmtMonth(s), period };
}
export const shiftAnchor = (period: Period, a: string, dir: number) =>
  period === "DAY" ? addK(a, dir) : period === "WEEK" ? addK(a, 7 * dir) : period === "QUARTER" ? addMonths(a, 3 * dir) : addMonths(a, dir);

/** Report filters from URL search params, with the preview's rule: members only ever see their own numbers. */
export function reportParams(sp: Record<string, string | undefined>, me: { id: string; role: string }, today: string) {
  const period: Period = PERIODS.includes(sp.period as Period) ? (sp.period as Period) : "MONTH";
  const anchor = isDayKey(sp.anchor) ? sp.anchor : today;
  const project = sp.project || "";
  const team = isLeadOrAdmin(me);
  const person = team ? sp.person || "" : me.id;
  return { period, anchor, project, person, team };
}

export type Row = { key: string; label: string; planned: number; done: number; completed: number; onTime: number; withDue: number; overdue: number; minutes: number; attMin?: number; leave?: number };
export type Bucket = { from: string; to: string; label: string; tip: string; count: number };
export type Report = {
  partial: boolean;
  buckets: Bucket[];
  comp: T[];
  totals: { planned: number; plannedDone: number; cancelled: number; rate: number; completed: number; onTime: number; onRate: number; overdue: number; minutes: number; adHoc: number };
  byM: Row[]; byP: Row[]; byC: Row[]; byS: Row[];
  overdueList: T[];
  rows: T[];
};

type LogLike = { taskId: string; userId: string; minutes: number; on: string };
export type ReportData = { tasks: T[]; logs: LogLike[]; logTasks: Map<string, T>; sessions: Sess[]; leaves: Leave[] };
type Env = { today: string; now: string; cal: CalLike; user: (id: string | null | undefined) => U | undefined; project: (id: string | null | undefined) => P | undefined };

export function buildReport(rg: Range, projectId: string, userId: string, d: ReportData, env: Env): Report {
  const { start, end } = rg, { today } = env;
  const cutoff = end > addK(today, 1) ? addK(today, 1) : end;
  const scope = (t: T) => (!projectId || t.projectId === projectId) && (!userId || t.assigneeId === userId);
  const inR = (k: string) => k >= start && k < end;
  const dueAll = d.tasks.filter((t) => scope(t) && !!t.dueDate && t.dueDate >= start && t.dueDate < cutoff);
  const cancelled = dueAll.filter((t) => t.status === "CANCELLED").length;
  const dueT = dueAll.filter((t) => t.status !== "CANCELLED");
  const comp = d.tasks.filter((t) => scope(t) && !!t.completedAt && inR(t.completedAt.slice(0, 10)));
  const logs = d.logs.filter((l) => inR(l.on) && (!userId || l.userId === userId) && (!projectId || d.logTasks.get(l.taskId)?.projectId === projectId));
  const adHoc = d.tasks.filter((t) => scope(t) && !t.ruleId && !!t.createdOn && inR(t.createdOn)).length;

  const maps = { m: new Map<string, Row>(), p: new Map<string, Row>(), c: new Map<string, Row>(), s: new Map<string, Row>() };
  const b = (map: Map<string, Row>, key: string, label: string) => {
    let r = map.get(key);
    if (!r) { r = { key, label, planned: 0, done: 0, completed: 0, onTime: 0, withDue: 0, overdue: 0, minutes: 0 }; map.set(key, r); }
    return r;
  };
  const keys = (t: T) => [
    b(maps.m, t.assigneeId || "none", env.user(t.assigneeId)?.name || "Unassigned"),
    b(maps.p, t.projectId || "none", env.project(t.projectId)?.name || "No project"),
    b(maps.c, t.frequency, FREQ[t.frequency] || t.frequency),
    b(maps.s, t.category, LINE[t.category] || t.category),
  ];
  let overdue = 0, onTime = 0, withDue = 0, minutes = 0;
  for (const t of dueT) {
    const late = !closed(t.status) && t.dueDate! < today;
    if (late) overdue++;
    for (const r of keys(t)) { r.planned++; if (t.status === "DONE") r.done++; if (late) r.overdue++; }
  }
  for (const t of comp) {
    const ok = !!t.dueDate && t.completedAt!.slice(0, 10) <= t.dueDate;
    if (t.dueDate) withDue++;
    if (ok) onTime++;
    for (const r of keys(t)) { r.completed++; if (t.dueDate) r.withDue++; if (ok) r.onTime++; }
  }
  for (const l of logs) {
    minutes += l.minutes;
    const t = d.logTasks.get(l.taskId); if (!t) continue;
    b(maps.m, l.userId, env.user(l.userId)?.name || "Someone").minutes += l.minutes;
    b(maps.p, t.projectId || "none", env.project(t.projectId)?.name || "No project").minutes += l.minutes;
    b(maps.c, t.frequency, FREQ[t.frequency] || t.frequency).minutes += l.minutes;
    b(maps.s, t.category, LINE[t.category] || t.category).minutes += l.minutes;
  }
  // attendance and leave per person
  for (const r of maps.m.values()) {
    if (r.key === "none") continue;
    r.attMin = d.sessions.filter((s) => s.userId === r.key && inR(s.in.slice(0, 10))).reduce((a, s) => a + sessionMinutes(s, today, env.now), 0);
    r.leave = d.leaves.filter((l) => l.userId === r.key && l.status === "APPROVED" && l.from < end && l.to >= start)
      .reduce((a, l) => a + (l.half ? 0.5 : workingDays(env.cal, l.from < start ? start : l.from, l.to >= end ? addK(end, -1) : l.to)), 0);
  }
  // chart buckets
  const buckets: Bucket[] = [];
  if (rg.period === "WEEK" || rg.period === "MONTH") for (let k = start; k < end; k = addK(k, 1)) buckets.push({ from: k, to: addK(k, 1), label: rg.period === "WEEK" ? fmtShort(k).split(",")[0].split(" ")[0] : String(+k.slice(8, 10)), tip: fmtDate(k), count: 0 });
  if (rg.period === "QUARTER") for (let k = startOfWeek(start), i = 1; k < end; k = addK(k, 7), i++) buckets.push({ from: k, to: addK(k, 7), label: "W" + i, tip: "Week of " + fmtDate(k), count: 0 });
  for (const t of comp) { const k = t.completedAt!.slice(0, 10); const bk = buckets.find((x) => k >= x.from && k < x.to); if (bk) bk.count++; }

  const sortR = (map: Map<string, Row>) => [...map.values()].sort((a, c) => c.planned - a.planned || c.completed - a.completed);
  const plannedDone = dueT.filter((t) => t.status === "DONE").length;
  const rows = [...new Map([...dueAll, ...comp].map((t) => [t.id, t])).values()];
  return {
    partial: cutoff < end, buckets, comp,
    totals: { planned: dueT.length, plannedDone, cancelled, rate: dueT.length ? plannedDone / dueT.length : 0, completed: comp.length, onTime, onRate: withDue ? onTime / withDue : 0, overdue, minutes, adHoc },
    byM: sortR(maps.m), byP: sortR(maps.p), byC: [...maps.c.values()].sort((a, c) => (FORDER[a.key] ?? 9) - (FORDER[c.key] ?? 9)), byS: sortR(maps.s),
    overdueList: sortTasks(dueT.filter((t) => !closed(t.status) && t.dueDate! < today)).slice(0, 20),
    rows,
  };
}

/** Loads the tasks, time entries, sessions and leave a report period needs. */
export async function loadReportData(rg: Range, projectId: string, userId: string, today: string): Promise<ReportData> {
  const { start, end } = rg;
  const cutoff = end > addK(today, 1) ? addK(today, 1) : end;
  // Moments are filtered a day wider on each side, then exactly by local day key in buildReport.
  const mFrom = fromLocal(addK(start, -1)), mTo = fromLocal(addK(end, 1));
  const tasks = await loadTasks({
    AND: [projectId ? { projectId } : {}, userId ? { assigneeId: userId } : {}],
    OR: [
      { dueDate: { gte: start, lt: cutoff } },
      { completedAt: { gte: mFrom, lt: mTo } },
      { ruleId: null, createdAt: { gte: mFrom, lt: mTo } },
    ],
  });
  const logRows = await prisma.timeLog.findMany({
    where: { workDate: { gte: start, lt: end }, ...(userId ? { userId } : {}), ...(projectId ? { task: { projectId } } : {}) },
    select: { taskId: true, userId: true, minutes: true, workDate: true },
  });
  const logs = logRows.map((l) => ({ taskId: l.taskId, userId: l.userId, minutes: l.minutes, on: l.workDate }));
  const logTasks = new Map(tasks.map((t) => [t.id, t]));
  const missing = [...new Set(logs.map((l) => l.taskId).filter((id) => !logTasks.has(id)))];
  if (missing.length) for (const t of await loadTasks({ id: { in: missing } })) logTasks.set(t.id, t);
  const [sessions, leaves] = await Promise.all([
    loadSessions({ signedInAt: { gte: mFrom, lt: mTo }, ...(userId ? { userId } : {}) }),
    loadLeaves({ status: "APPROVED", fromDate: { lt: end }, toDate: { gte: start }, ...(userId ? { userId } : {}) }),
  ]);
  return { tasks, logs, logTasks, sessions, leaves };
}

/** Everything a report page or CSV export needs in one call. */
export async function loadReport(rg: Range, projectId: string, userId: string, base: { today: string; now: string; cal: CalLike; user: Env["user"] }) {
  const [projects, data] = await Promise.all([loadProjects(), loadReportData(rg, projectId, userId, base.today)]);
  const pm = new Map(projects.map((p) => [p.id, p]));
  const project = (id: string | null | undefined) => (id ? pm.get(id) : undefined);
  const rep = buildReport(rg, projectId, userId, data, { ...base, project });
  return { rep, projects, project };
}

/** CSV with one row per task due or completed in the period (port of the preview's csvFor). */
export function csvFor(rep: Report, user: Env["user"], project: Env["project"]) {
  const c = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [["Task", "Project", "Client", "Industry", "Assignee", "Cadence", "Service line", "Priority", "Status", "Due date", "Completed on", "On time", "Subtasks done", "Estimate (min)", "Time spent (min)"].join(",")];
  for (const t of rep.rows) {
    const p = project(t.projectId); const cd = t.completedAt?.slice(0, 10) || "";
    out.push([t.title, p?.name, p ? p.clientLabel || "Internal" : "", p?.industry, user(t.assigneeId)?.name, FREQ[t.frequency], LINE[t.category], PRIORITY[t.priority], STATUS[t.status], t.dueDate, cd, cd && t.dueDate ? (cd <= t.dueDate ? "Yes" : "No") : "", t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length} of ${t.subtasks.length}` : "", t.estimate, t.spent].map(c).join(","));
  }
  return out.join("\n");
}
