// Port of the preview's vProjects: filters live in the URL (industry, line, status).
import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { INDUSTRIES, LINE, LINES, OPEN, PSTATUS } from "@/lib/constants";
import { loadProjects } from "@/lib/model";
import { isLeadOrAdmin } from "@/lib/permissions";
import { AutoSubmit } from "@/components/client/ActionForm";
import { Empty, Options, Person } from "@/components/ui";

const STATUS_OPTS: [string, string][] = [["current", "Active and paused"], ["ACTIVE", "Active"], ["PAUSED", "Paused"], ["ARCHIVED", "Archived"], ["all", "All"]];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { me, today } = ctx;
  const f = { industry: sp.industry || "", line: LINES.includes(sp.line || "") ? sp.line! : "", status: STATUS_OPTS.some(([k]) => k === sp.status) ? sp.status! : "current" };

  const [all, openRows, ruleRows] = await Promise.all([
    loadProjects(),
    prisma.task.findMany({ where: { projectId: { not: null }, status: { in: OPEN } }, select: { projectId: true, dueDate: true } }),
    prisma.recurringRule.groupBy({ by: ["projectId"], where: { active: true }, _count: { _all: true } }),
  ]);
  const openBy = new Map<string, { open: number; od: number }>();
  for (const t of openRows) {
    const x = openBy.get(t.projectId!) || { open: 0, od: 0 };
    x.open++; if (t.dueDate && t.dueDate < today) x.od++;
    openBy.set(t.projectId!, x);
  }
  const rulesBy = new Map(ruleRows.map((r) => [r.projectId, r._count._all]));

  const list = all
    .filter((p) => (f.status === "all" || (f.status === "current" ? p.status !== "ARCHIVED" : p.status === f.status)) && (!f.industry || p.industry === f.industry) && (!f.line || p.line === f.line))
    .sort((a, b) => (a.status > b.status ? 1 : a.status < b.status ? -1 : a.name.localeCompare(b.name)));
  const usedInd = INDUSTRIES.filter((i) => all.some((p) => p.industry === i));

  return (
    <>
      <header className="between">
        <div><h1>Projects</h1><p className="soft">Each project holds its team and the recurring tasks that create work automatically.</p></div>
        {isLeadOrAdmin(me) ? <Link className="btn btn-p" href="/projects/new">New project</Link> : null}
      </header>
      <Form key={`${f.industry}|${f.line}|${f.status}`} action="/projects" className="panel pad row" style={{ alignItems: "flex-end" }}>
        <div style={{ minWidth: 200 }}><label className="lbl" htmlFor="pf-i">Industry</label><AutoSubmit className="field" id="pf-i" name="industry" defaultValue={f.industry}><Options opts={[["", "All industries"], ...usedInd.map((i): [string, string] => [i, `${i} (${all.filter((p) => p.industry === i).length})`])]} /></AutoSubmit></div>
        <div style={{ minWidth: 190 }}><label className="lbl" htmlFor="pf-l">Service line</label><AutoSubmit className="field" id="pf-l" name="line" defaultValue={f.line}><Options opts={[["", "All service lines"], ...LINES.map((x): [string, string] => [x, LINE[x]])]} /></AutoSubmit></div>
        <div style={{ minWidth: 160 }}><label className="lbl" htmlFor="pf-s">Status</label><AutoSubmit className="field" id="pf-s" name="status" defaultValue={f.status}><Options opts={STATUS_OPTS} /></AutoSubmit></div>
        {f.industry || f.line || f.status !== "current" ? <Link className="btn btn-q" href="/projects">Clear filters</Link> : null}
        <noscript><button className="btn btn-q">Apply</button></noscript>
      </Form>
      {list.length ? (
        <div className="panel tablebox">
          <table className="t" style={{ minWidth: 860 }}>
            <thead><tr><th>Project</th><th>Industry</th><th>Service line</th><th>Lead</th><th className="r">People</th><th className="r">Recurring</th><th className="r">Open</th><th className="r">Overdue</th></tr></thead>
            <tbody>
              {list.map((p) => {
                const o = openBy.get(p.id) || { open: 0, od: 0 };
                return (
                  <tr key={p.id} className={p.status !== "ACTIVE" ? "dim" : ""}>
                    <td><Link className="tl-title" style={{ fontWeight: 600 }} href={`/projects/${p.id}`}>{p.name}</Link>
                      <div className="small muted">{p.clientLabel || "Internal"}{p.status !== "ACTIVE" ? ", " + PSTATUS[p.status].toLowerCase() : ""}{p.members.includes(me.id) ? ", you are on this team" : ""}</div></td>
                    <td className="small">{p.industry || "Not set"}</td>
                    <td className="small soft">{LINE[p.line]}</td>
                    <td><Person u={ctx.user(p.leadId)} /></td>
                    <td className="r num">{p.members.length}</td>
                    <td className="r num">{rulesBy.get(p.id) || 0}</td>
                    <td className="r num">{o.open}</td>
                    <td className={`r num ${o.od ? "t-rust" : "muted"}`} style={o.od ? { fontWeight: 600 } : undefined}>{o.od}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty>No projects match these filters.</Empty>}
    </>
  );
}
