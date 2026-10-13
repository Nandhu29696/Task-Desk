// Recurring task engine. The pure parts (matches, occurrences, scheduleDate, describeRule) are safe anywhere;
// generate, resetRuleFuture and rescheduleAll write to the database.
import { addK, diffK, dowK, fmtDate, kd, lastDom, todayKey } from "./dates";
import { WD } from "./constants";
import { holidayOn, isWeekend, type CalLike } from "./calendar";

export type RuleLike = { frequency: string; weekday: number | null; monthDay: number | null; skipWeekends: boolean; dueOffsetDays: number; startDate: string; endDate: string | null };

/** Does the rule fire on day k (before holiday shifting)? */
export function matches(cal: CalLike, r: RuleLike, k: string) {
  const d = dowK(k), dt = kd(k);
  switch (r.frequency) {
    case "DAILY": return !(r.skipWeekends && isWeekend(cal, k));
    case "WEEKLY": return d === (r.weekday ?? 1);
    case "MONTHLY": return dt.getUTCDate() === Math.min(r.monthDay ?? 1, lastDom(dt.getUTCFullYear(), dt.getUTCMonth()));
    case "QUARTERLY": {
      const s = kd(r.startDate);
      const mf = (dt.getUTCFullYear() - s.getUTCFullYear()) * 12 + (dt.getUTCMonth() - s.getUTCMonth());
      if (((mf % 3) + 3) % 3 !== 0) return false;
      return dt.getUTCDate() === Math.min(r.monthDay ?? 1, lastDom(dt.getUTCFullYear(), dt.getUTCMonth()));
    }
  }
  return false;
}

/** Occurrence dates of a rule between from and to (inclusive). */
export function occurrences(cal: CalLike, r: RuleLike, from: string, to: string) {
  if (r.frequency === "ONCE") { const due = addK(r.startDate, r.dueOffsetDays || 0); return due >= from && due <= to ? [due] : []; }
  const out: string[] = []; let k = from < r.startDate ? r.startDate : from;
  const end = r.endDate && r.endDate < to ? r.endDate : to;
  let g = 0;
  while (k <= end && g++ < 800) { if (matches(cal, r, k)) out.push(k); k = addK(k, 1); }
  return out;
}

/** Holidays: daily routines are skipped, everything else moves to the next working day. */
export function scheduleDate(cal: CalLike, r: { frequency: string }, occ: string): string | null {
  if (r.frequency === "DAILY") return holidayOn(cal, occ) ? null : occ;
  let d = occ, moved = false, g = 0;
  while (g++ < 20 && (holidayOn(cal, d) || (moved && isWeekend(cal, d)))) { d = addK(d, 1); moved = true; }
  return d;
}

export function describeRule(r: RuleLike) {
  switch (r.frequency) {
    case "DAILY": return r.skipWeekends ? "Every working day" : "Every day";
    case "WEEKLY": return "Every " + WD[r.weekday ?? 1];
    case "MONTHLY": return "Monthly on day " + (r.monthDay ?? 1);
    case "QUARTERLY": return "Every 3 months on day " + (r.monthDay ?? 1);
    case "ONCE": return "One time, due " + fmtDate(addK(r.startDate, r.dueOffsetDays || 0));
  }
  return "";
}

/** Rough planned minutes per month for active rules. */
export const plannedPerMonth = (rules: { active: boolean; frequency: string; skipWeekends: boolean; estimate: number | null }[]) =>
  rules.filter((r) => r.active).reduce((a, r) => a + (({ DAILY: r.skipWeekends ? 22 : 30, WEEKLY: 4.3, MONTHLY: 1, QUARTERLY: 1 / 3, ONCE: 0 } as Record<string, number>)[r.frequency] || 0) * (r.estimate || 0), 0);

export const LOOKAHEAD = Number(process.env.GENERATION_LOOKAHEAD_DAYS || 7);
export const daysBetween = (a: string, b: string) => diffK(b, a);
export { todayKey };
