// Pure business rules shared by pages and actions. No database access here.
import { closed, LIVE_STAGES, PRANK } from "./constants";
import { monthEnd } from "./dates";

type TaskLike = { id: string; status: string; deps: string[]; approvals: { status: string; userId: string }[]; dueDate: string | null; priority: string };

export const sortTasks = <X extends { dueDate: string | null; priority: string }>(a: X[]) =>
  [...a].sort((x, y) => ((x.dueDate || "9999") < (y.dueDate || "9999") ? -1 : (x.dueDate || "9999") > (y.dueDate || "9999") ? 1 : PRANK[x.priority] - PRANK[y.priority]));

export const pendingApprovals = (t: Pick<TaskLike, "approvals">) => t.approvals.filter((a) => a.status === "PENDING");
/** Open linked tasks plus pending approvals. A task cannot be marked done while this is above 0. */
export function blockerCount(t: TaskLike, statusOf: (id: string) => string | undefined) {
  return t.deps.filter((d) => { const s = statusOf(d); return s !== undefined && !closed(s); }).length + pendingApprovals(t).length;
}
export const openDeps = (t: TaskLike, statusOf: (id: string) => string | undefined) => t.deps.filter((d) => { const s = statusOf(d); return s !== undefined && !closed(s); });

// ============ mentions ============
export const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** People mentioned with @Full Name or @First name in a comment (longest names first, whole words). */
export function mentionedUsers<P extends { id: string; name: string; active: boolean }>(body: string, users: P[]): P[] {
  const out: P[] = [];
  const cands = users.filter((u) => u.active).flatMap((u) => [[u.name, u] as const, [u.name.split(" ")[0], u] as const]).sort((a, b) => b[0].length - a[0].length);
  let text = body;
  for (const [name, u] of cands) {
    const re = new RegExp("@" + reEsc(name) + "\\b", "i");
    if (re.test(text)) { if (!out.includes(u)) out.push(u); text = text.replace(new RegExp("@" + reEsc(name) + "\\b", "gi"), " "); }
  }
  return out;
}

// ============ activity log categories ============
export function actCat(a: string) {
  if (a === "commented") return "COMMENT";
  if (a === "logged time") return "TIME";
  if (/signed (in|out)|leave/.test(a)) return "ATT";
  if (/task|subtask|status|dependency|collaborator|approv/.test(a) || a === "approved" || a === "rejected") return "TASK";
  return "OTHER";
}

// ============ clients ============
type Svc = { type: string; price: number; cycle: string | null; startDate: string; completedDate: string; line: string };
type ClientLike = { stage: string; services: Svc[] };
export const monthlyEq = (s: Svc) => (s.cycle === "QUARTERLY" ? s.price / 3 : s.cycle === "YEARLY" ? s.price / 12 : s.price);
export const svcLive = (s: Svc, today: string) => !s.completedDate || s.completedDate >= today;
/** Recurring value per month from services that are running, for live clients. */
export const recurringMonthly = (c: ClientLike, today: string) =>
  LIVE_STAGES.includes(c.stage) ? c.services.filter((s) => s.type === "RECURRING" && svcLive(s, today) && (!s.startDate || s.startDate <= monthEnd(today))).reduce((a, s) => a + monthlyEq(s), 0) : 0;
/** One time project value started this month, for clients past negotiation. */
export const oneTimeThisMonth = (c: ClientLike, today: string) =>
  ["LEAD", "PROPOSAL", "NEGOTIATION"].includes(c.stage) ? 0 : c.services.filter((s) => s.type === "ONE_TIME" && s.startDate && s.startDate.slice(0, 7) === today.slice(0, 7)).reduce((a, s) => a + s.price, 0);
export const pipelineValue = (c: ClientLike) => c.services.reduce((a, s) => a + (s.type === "RECURRING" ? monthlyEq(s) : s.price), 0);

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const AV_COLORS = ["#7B3F61", "#3F6B4C", "#7A6A2E", "#2F5D7C", "#6B4A8A", "#8A4B2E", "#336B6B", "#5B5F2A"];
export const avColor = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; };
