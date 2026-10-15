// Port of the preview's vReports. Filters in the URL: period, anchor, project, person.
// Members only ever see their own numbers; leads and admins can see the whole team.
import Link from "next/link";
import Form from "next/form";
import type { ReactNode } from "react";
import { getCtx, userOpts } from "@/lib/context";
import { PERIOD, closed } from "@/lib/constants";
import { fmtDate, fmtTime, mins, pct } from "@/lib/dates";
import { sortTasks } from "@/lib/logic";
import { csvFor, loadReport, PERIOD_WORD, PERIODS, rangeFor, reportParams, shiftAnchor, type Row } from "@/lib/report";
import { AutoSubmit } from "@/components/client/ActionForm";
import { CopyButton } from "@/components/client/Widgets";
import { AutoInput } from "@/components/projects/Bits";
import { Cad, Empty, Options, Stats } from "@/components/ui";

function Breakdown({ title, head, rows, label, people = false }: { title: string; head: string; rows: Row[]; label: (r: Row) => ReactNode; people?: boolean }) {
  if (!rows.length) return null;
  return (
    <section className="stack"><h2>{title}</h2>
      <div className="panel tablebox"><table className="t" style={{ minWidth: people ? 900 : 720 }}>
        <thead><tr><th>{head}</th><th className="r">Due</th><th className="r">Done</th><th style={{ width: "22%" }}>Completion</th><th className="r">On time</th><th className="r">Overdue</th><th className="r">Time logged</th>{people ? <><th className="r">Signed in</th><th className="r">Leave days</th></> : null}</tr></thead>
        <tbody>{rows.map((r) => {
          const rate = r.planned ? r.done / r.planned : 0;
          const col = rate >= 0.9 ? "var(--moss)" : rate >= 0.7 ? "var(--teal)" : "var(--ochre)";
          return (
            <tr key={r.key}>
              <td style={{ fontWeight: 500 }}>{label(r)}</td>
              <td className="r num">{r.planned}</td>
              <td className="r num">{r.done}</td>
              <td>{r.planned ? <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}><div className="bar"><span style={{ width: pct(rate), background: col }} /></div><span className="num small" style={{ width: 38, textAlign: "right" }}>{pct(rate)}</span></div> : <span className="small muted">Nothing due</span>}</td>
              <td className="r num">{r.withDue ? pct(r.onTime / r.withDue) : "None"}</td>
              <td className={`r num ${r.overdue ? "t-rust" : "muted"}`} style={r.overdue ? { fontWeight: 600 } : undefined}>{r.overdue}</td>
              <td className="r num">{mins(r.minutes)}</td>
              {people ? <><td className="r num">{r.key === "none" ? "" : mins(r.attMin || 0)}</td><td className="r num">{r.key === "none" ? "" : r.leave || 0}</td></> : null}
            </tr>
          );
        })}</tbody>
      </table></div>
    </section>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { me, today } = ctx;
  const f = reportParams(sp, me, today);
  const personId = f.person;
  const rg = rangeFor(f.period, f.anchor);
  const { rep, projects, project } = await loadReport(rg, f.project, personId, { today, now: ctx.now, cal: ctx.cal, user: ctx.user });
  const T = rep.totals;
  const maxD = Math.max(1, ...rep.buckets.map((d) => d.count));
  const scope = [f.project ? project(f.project)?.name || "All projects" : "All projects", personId ? ctx.user(personId)?.name || "whole team" : "whole team"].join(", ");
  const periodWord = PERIOD_WORD[f.period];
  const csv = csvFor(rep, ctx.user, project);

  const q = (o: Partial<{ period: string; anchor: string; project: string; person: string }>) => {
    const v = { period: f.period, anchor: f.anchor, project: f.project, person: f.team ? f.person : "", ...o };
    const s = new URLSearchParams();
    if (v.period !== "MONTH") s.set("period", v.period);
    if (v.anchor && v.anchor !== today) s.set("anchor", v.anchor);
    if (v.project) s.set("project", v.project);
    if (v.person) s.set("person", v.person);
    const str = s.toString();
    return str ? `?${str}` : "";
  };
  const csvHref = `/api/reports/csv?${new URLSearchParams({ period: f.period, anchor: f.anchor, ...(f.project ? { project: f.project } : {}), ...(f.team && f.person ? { person: f.person } : {}) }).toString()}`;

  return (
    <>
      <header className="between">
        <div><h1>{PERIOD[f.period]} report</h1><p className="soft">{rg.label}. {scope}</p></div>
        <div className="row" style={{ gap: 8 }}>
          <CopyButton text={csv} label="Copy CSV" className="btn btn-q" done="CSV copied. Paste it into Google Sheets or Excel">Copy CSV</CopyButton>
          <a className="btn btn-q" href={csvHref} download>Download CSV</a>
        </div>
      </header>
      <div className="panel pad stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="seg" role="group" aria-label="Report period">
            {PERIODS.map((k) => <Link key={k} href={`/reports${q({ period: k })}`} aria-pressed={f.period === k}>{PERIOD[k]}</Link>)}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn btn-q btn-sm" href={`/reports${q({ anchor: shiftAnchor(f.period, f.anchor, -1) })}`} aria-label={`Previous ${periodWord}`}>Previous</Link>
            <Form key={f.anchor} action="/reports" style={{ display: "contents" }}>
              {f.period !== "MONTH" ? <input type="hidden" name="period" value={f.period} /> : null}
              {f.project ? <input type="hidden" name="project" value={f.project} /> : null}
              {f.team && f.person ? <input type="hidden" name="person" value={f.person} /> : null}
              <AutoInput type="date" className="fsm" name="anchor" defaultValue={f.anchor} aria-label="Pick a date in the period" />
            </Form>
            <Link className="btn btn-q btn-sm" href={`/reports${q({ anchor: shiftAnchor(f.period, f.anchor, 1) })}`} aria-label={`Next ${periodWord}`}>Next</Link>
            <Link className="btn btn-q btn-sm" href={`/reports${q({ anchor: today })}`}>Today</Link>
          </div>
        </div>
        <Form key={`${f.project}|${f.person}`} action="/reports" className="row" style={{ alignItems: "flex-end" }}>
          {f.period !== "MONTH" ? <input type="hidden" name="period" value={f.period} /> : null}
          {f.anchor !== today ? <input type="hidden" name="anchor" value={f.anchor} /> : null}
          <div style={{ minWidth: 200 }}><label className="lbl" htmlFor="r-p">Project</label><AutoSubmit className="field" id="r-p" name="project" defaultValue={f.project}><Options opts={[["", "All projects"], ...projects.map((p): [string, string] => [p.id, p.name])]} /></AutoSubmit></div>
          {f.team
            ? <div style={{ minWidth: 180 }}><label className="lbl" htmlFor="r-u">Person</label><AutoSubmit className="field" id="r-u" name="person" defaultValue={f.person}><Options opts={[["", "Whole team"], ...userOpts(ctx)]} /></AutoSubmit></div>
            : <p className="small muted">You are seeing your own report. Leads and admins can see the whole team.</p>}
          <noscript><button className="btn btn-q">Apply</button></noscript>
        </Form>
      </div>

      <Stats cls="six" items={[
        [rep.partial ? "Tasks due so far" : "Tasks due", T.planned, "", `${T.plannedDone} done${T.cancelled ? `, ${T.cancelled} cancelled` : ""}`],
        ["Completion", T.planned ? pct(T.rate) : "None", T.rate >= 0.9 ? "t-moss" : T.planned && T.rate < 0.7 ? "t-rust" : "", rep.partial ? "of tasks due up to today" : `of tasks due this ${periodWord}`],
        ["On time", T.completed ? pct(T.onRate) : "None", "", `${T.onTime} of ${T.completed} completed`],
        ["Still overdue", T.overdue, T.overdue ? "t-rust" : "", "due, not done"],
        ["Time logged", mins(T.minutes), "", "from time entries"],
        ["One time tasks", T.adHoc, "", "added outside routines"],
      ]} />

      {rep.buckets.length ? (
        <section className="panel pad stack">
          <div className="between"><h2>Tasks completed {f.period === "QUARTER" ? "each week" : "each day"}</h2><span className="small muted">{T.completed} in total</span></div>
          <div className="chart future" role="img" aria-label="Bar chart of tasks completed">
            {rep.buckets.map((d) => <div key={d.from} className={d.from > today ? "f" : ""} title={`${d.tip}: ${d.count} completed`}><span style={{ height: `${(d.count / maxD) * 100}%`, minHeight: d.count ? 3 : 0 }} /></div>)}
          </div>
          <div className="axis">{rep.buckets.map((d, i) => <div key={d.from} className="num">{f.period === "MONTH" ? (i === 0 || (i + 1) % 5 === 0 ? d.label : "") : d.label}</div>)}</div>
        </section>
      ) : (
        <section className="panel pad stack"><h2>Completed on this day</h2>
          {rep.comp.length ? (
            <ul className="feed">{sortTasks(rep.comp).map((t) => <li key={t.id}><Link className="link" href={`/tasks/${t.id}`}>{t.title}</Link> <span className="soft">by {ctx.user(t.assigneeId)?.name || "someone"} at {fmtTime(t.completedAt!.slice(11, 16))}</span></li>)}</ul>
          ) : <p className="small muted">Nothing completed on this day.</p>}
        </section>
      )}

      <Breakdown title="By cadence" head="Cadence" rows={rep.byC} label={(r) => <Cad f={r.key} />} />
      <p className="small muted" style={{ marginTop: -16 }}>Due and done count tasks due in this {periodWord}{rep.partial ? " up to today" : ""}, leaving out cancelled ones. On time counts tasks completed in this {periodWord} on or before their due date.</p>
      {f.team && !personId
        ? <Breakdown title="By person" head="Person" rows={rep.byM} label={(r) => r.label} people />
        : personId ? <Breakdown title="Attendance and work" head="Person" rows={rep.byM.filter((r) => r.key === personId)} label={(r) => r.label} people /> : null}
      {!f.project ? <Breakdown title="By project" head="Project" rows={rep.byP} label={(r) => r.label} /> : null}
      <Breakdown title="By service line" head="Service line" rows={rep.byS} label={(r) => r.label} />

      <section className="stack"><h2>Due in this {periodWord} and still open</h2>
        {rep.overdueList.length ? (
          <div className="panel tablebox"><table className="t" style={{ minWidth: 640 }}>
            <thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Cadence</th><th>Was due</th></tr></thead>
            <tbody>{rep.overdueList.filter((t) => !closed(t.status)).map((t) => (
              <tr key={t.id}>
                <td><Link className="tl-title" href={`/tasks/${t.id}`}>{t.title}</Link></td>
                <td className="small soft">{project(t.projectId)?.name || "No project"}</td>
                <td className="small">{ctx.user(t.assigneeId)?.name || "Unassigned"}</td>
                <td><Cad f={t.frequency} /></td>
                <td className="small num t-rust">{fmtDate(t.dueDate)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>Nothing overdue in this period.</Empty>}
      </section>

      <details className="panel"><summary>CSV preview ({rep.rows.length} rows)</summary>
        <div className="body"><textarea className="field" rows={8} readOnly style={{ fontSize: 12, whiteSpace: "pre" }} aria-label="CSV data" value={csv} /></div>
      </details>
    </>
  );
}
