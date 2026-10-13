// CSV export of the report: the tasks due or completed in the period, with the same filters and permission rules as /reports.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadCal, loadUsers } from "@/lib/model";
import { stampOf, todayKey } from "@/lib/dates";
import { csvFor, loadReport, rangeFor, reportParams } from "@/lib/report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const today = todayKey();
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const f = reportParams(sp, me, today);
  const rg = rangeFor(f.period, f.anchor);
  const [users, cal] = await Promise.all([loadUsers(), loadCal()]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const user = (id: string | null | undefined) => (id ? byId.get(id) : undefined);
  const { rep, project } = await loadReport(rg, f.project, f.person, { today, now: stampOf(new Date())!, cal, user });
  const csv = csvFor(rep, user, project);
  const name = `taskdesk report ${f.period.toLowerCase()} ${rg.start}${f.project ? " " + (project(f.project)?.name || "") : ""}${f.person ? " " + (user(f.person)?.name || "") : ""}`
    .trim().replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, "_");
  return new NextResponse("﻿" + csv + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
