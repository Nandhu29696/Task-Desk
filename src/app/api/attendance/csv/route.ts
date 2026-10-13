import { getCurrentUser } from "@/lib/auth";
import { loadCal, loadUsers } from "@/lib/model";
import { stampOf, todayKey } from "@/lib/dates";
import { attScope, dailyRows, loadAttendance } from "@/components/office/attendance";

export const dynamic = "force-dynamic";

const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Attendance for one month as CSV. Leads and the admin get everyone (or one person); members only themselves. */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Please sign in again.", { status: 401 });
  const url = new URL(req.url);
  const today = todayKey(), now = stampOf(new Date())!;
  const [users, cal] = await Promise.all([loadUsers(), loadCal()]);
  const { month, personId } = attScope(me, users, today, { month: url.searchParams.get("month") || undefined, person: url.searchParams.get("person") || undefined });
  const d = await loadAttendance(cal, users, month, personId, today, now);
  const lines = [["Date", "Person", "Email", "Sign in", "Sign out", "Signed in minutes", "Sessions", "Note"].join(",")];
  for (const p of d.people) {
    for (const r of [...dailyRows(cal, d, p.id)].reverse()) {
      lines.push([r.k, p.name, p.email, r.a?.first || "", r.a ? r.a.last || (r.a.open ? "Still signed in" : "") : "", r.a ? Math.round(r.a.minutes) : "", r.a?.count || "", r.note.text].map(cell).join(","));
    }
  }
  const who = personId ? (users.find((x) => x.id === personId)?.name || "person").replace(/[^A-Za-z0-9]+/g, "_") : "team";
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance_${month}_${who}.csv"`, "Cache-Control": "no-store" },
  });
}
