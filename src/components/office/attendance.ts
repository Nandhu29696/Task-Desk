// Attendance data for one month, shared by the Attendance page and its CSV export.
import { addK, addMonths, fmtMonth, fmtTime, hm2m, m2hm } from "@/lib/dates";
import { holidayOn, isWeekend, isWorking, workingDays } from "@/lib/calendar";
import { dayAttendance } from "@/lib/attendance";
import { isLeadOrAdmin } from "@/lib/permissions";
import { LTYPE } from "@/lib/constants";
import { loadLeaves, loadSessions, type Cal, type Leave, type U } from "@/lib/model";

/** The last 6 months as [YYYY-MM, label], newest first. */
export function lastMonths(today: string): [string, string][] {
  const out: [string, string][] = [];
  let mk = today.slice(0, 7);
  for (let i = 0; i < 6; i++) { out.push([mk, fmtMonth(mk)]); mk = addMonths(mk + "-01", -1).slice(0, 7); }
  return out;
}

/** Month and person after the permission rules: members only ever see themselves. */
export function attScope(me: { id: string; role: string }, users: U[], today: string, sp: { month?: string; person?: string }) {
  const team = isLeadOrAdmin(me);
  const months = lastMonths(today);
  const month = months.some(([k]) => k === sp.month) ? sp.month! : months[0][0];
  const personId = team ? (sp.person && users.some((x) => x.id === sp.person) ? sp.person : "") : me.id;
  return { team, months, month, personId };
}

export type AttData = Awaited<ReturnType<typeof loadAttendance>>;

export async function loadAttendance(cal: Cal, users: U[], month: string, personId: string, today: string, now: string) {
  const first = month + "-01", end = addMonths(first, 1);
  const last = end > addK(today, 1) ? today : addK(end, -1);
  const people = users.filter((x) => x.active && (!personId || x.id === personId));
  const ids = people.map((x) => x.id);
  const [sessions, leaves] = await Promise.all([
    loadSessions({ userId: { in: ids }, day: { gte: first, lte: last } }),
    loadLeaves({ userId: { in: ids }, status: "APPROVED", fromDate: { lte: last }, toDate: { gte: first } }),
  ]);
  const onLeave = (uid: string, k: string) => leaves.find((l) => l.userId === uid && l.from <= k && l.to >= k);
  const att = (uid: string, k: string) => dayAttendance(sessions, uid, k, today, now);
  const work = first <= last ? workingDays(cal, first, last) : 0;
  const summary = people.map((x) => {
    let present = 0, extra = 0, mn = 0, late = 0, lv = 0;
    const ins: number[] = [], outs: number[] = [];
    for (let k = first; k <= last; k = addK(k, 1)) {
      const l = onLeave(x.id, k);
      if (l && isWorking(cal, k)) lv += l.half ? 0.5 : 1;
      const a = att(x.id, k); if (!a) continue;
      mn += a.minutes;
      if (!isWorking(cal, k)) { extra++; continue; }
      present++; ins.push(hm2m(a.first)); if (a.last) outs.push(hm2m(a.last)); if (a.first > "10:00") late++;
    }
    const avg = (arr: number[]) => (arr.length ? fmtTime(m2hm(arr.reduce((p, c) => p + c, 0) / arr.length)) : "None");
    return { x, present, extra, mn, avgIn: avg(ins), avgOut: avg(outs), late, lv, work };
  });
  return { first, last, people, sessions, leaves, summary, onLeave, att };
}

/** One row per day, newest first, for one person. */
export function dailyRows(cal: Cal, d: { first: string; last: string; onLeave: (uid: string, k: string) => Leave | undefined; att: (uid: string, k: string) => ReturnType<typeof dayAttendance> }, uid: string) {
  const rows = [];
  for (let k = d.last; k >= d.first; k = addK(k, -1)) {
    const a = d.att(uid, k), lv = d.onLeave(uid, k), h = holidayOn(cal, k), we = isWeekend(cal, k);
    const note: { kind: "leave" | "hol" | "off" | "absent" | "late" | ""; text: string } =
      lv && isWorking(cal, k) ? { kind: "leave", text: `${LTYPE[lv.type]}${lv.half ? ", half day" : ""}` }
      : h ? { kind: "hol", text: h.name }
      : we ? { kind: "off", text: "Weekly off" }
      : !a ? { kind: "absent", text: "No sign in" }
      : a.first > "10:00" ? { kind: "late", text: "Late sign in" } : { kind: "", text: "" };
    rows.push({ k, a, lv, h, we, note });
  }
  return rows;
}

