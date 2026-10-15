// Port of the preview's vProject (Version 11 profile style project page).
// Period in ?period= (WEEK, MONTH default, QUARTER, ALL); add forms in ?panel=rule or ?panel=tpl.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx, userOpts } from "@/lib/context";
import { FORDER, FREQS, INDUSTRIES, LINE, LINES, PSTATUS, closed } from "@/lib/constants";
import { addK, addMonths, dayOf, fmtMonth, fmtShort, fmtStamp, fromLocal, mins, monthStart, pct, quarterStart, startOfWeek } from "@/lib/dates";
import { loadActivities, loadProjects, loadRules, loadTasks } from "@/lib/model";
import { canManage, isAdmin } from "@/lib/permissions";
import { describeRule, plannedPerMonth } from "@/lib/recurrence";
import { sortTasks } from "@/lib/logic";
import { addRule, addTemplates, deleteRule, editRule, saveMembers, saveProjectSettings, toggleRule } from "@/app/actions/projects";
import { ActionForm } from "@/components/client/ActionForm";
import { ConfirmButton, CopyButton, Modal } from "@/components/client/Widgets";
import { Icon } from "@/components/Icon";
import { lineCtx, TaskLines } from "@/components/tasklines";
import { Av, Bar, Cad, CommsChips, Empty, Options, Person, Pri, Stats } from "@/components/ui";
import { RuleFields } from "@/components/projects/RuleFields";
import { TplPicker } from "@/components/projects/TplPicker";
import { CommsBoxes } from "@/components/projects/CommsBoxes";
import { ModalCancel } from "@/components/projects/Bits";

type PeriodKey = "WEEK" | "MONTH" | "QUARTER" | "ALL";
const PERIODS: [PeriodKey, string][] = [["WEEK", "This week"], ["MONTH", "This month"], ["QUARTER", "This quarter"], ["ALL", "All time"]];
const PWORD: Record<PeriodKey, string> = { WEEK: "this week", MONTH: "this month", QUARTER: "this quarter", ALL: "all time" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getCtx();
  const { me, today: t0, user } = ctx;
  const p = (await loadProjects({ id }))[0];
  if (!p) return <Empty>Project not found.</Empty>;
  const manage = canManage(me, p);
  const period: PeriodKey = PERIODS.some(([k]) => k === sp.period) ? (sp.period as PeriodKey) : "MONTH";
  const panel = manage && (sp.panel === "rule" || sp.panel === "tpl") ? sp.panel : null;
  const base = `/projects/${p.id}${period !== "MONTH" ? `?period=${period}` : ""}`;
  const withPanel = (x: string) => `/projects/${p.id}?${period !== "MONTH" ? `period=${period}&` : ""}panel=${x}`;

  const [from, to] = period === "WEEK" ? [startOfWeek(t0), addK(startOfWeek(t0), 6)] : period === "MONTH" ? [monthStart(t0), addK(addMonths(t0, 1), -1)] : period === "QUARTER" ? [quarterStart(t0), addK(addMonths(quarterStart(t0), 3), -1)] : ["", "9999"];
  const pword = PWORD[period];
  const inP = (k: string | null | undefined): k is string => !!k && k >= from && k <= to;
  const inPeriodAt = period === "ALL" ? {} : { createdAt: { gte: fromLocal(from), lt: fromLocal(addK(to, 1)) } };

  // Light rows for every task (stats and charts); full rows only for the open tasks listed on the page.
  // Time and comments are summed in the database for the selected period.
  const [rulesRaw, light, openFull, logRows, cmtRows, collabRows, feed, clients] = await Promise.all([
    loadRules({ projectId: p.id }),
    prisma.task.findMany({ where: { projectId: p.id }, select: { id: true, status: true, dueDate: true, completedAt: true, assigneeId: true, frequency: true } }),
    loadTasks({ projectId: p.id, status: { notIn: ["DONE", "CANCELLED"] } }),
    prisma.timeLog.groupBy({ by: ["taskId", "userId"], where: { task: { projectId: p.id }, ...(period === "ALL" ? {} : { workDate: { gte: from, lte: to } }) }, _sum: { minutes: true } }),
    prisma.comment.groupBy({ by: ["userId"], where: { task: { projectId: p.id }, ...inPeriodAt }, _count: { _all: true } }),
    prisma.taskCollaborator.findMany({ where: { task: { projectId: p.id } }, distinct: ["userId"], select: { userId: true } }),
    loadActivities({ projectId: p.id }, 30),
    manage && isAdmin(me) ? prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const rules = [...rulesRaw].sort((a, b) => Number(b.active) - Number(a.active) || FORDER[a.frequency] - FORDER[b.frequency] || a.title.localeCompare(b.title));
  const pt = light.map((t) => ({ ...t, doneOn: t.completedAt ? dayOf(t.completedAt) : null }));
  const ptIds = new Set(pt.map((t) => t.id));
  const open = sortTasks(openFull);
  const shownOpen = open.slice(0, 60);
  const outside = [...new Set(shownOpen.flatMap((t) => t.deps).filter((d) => !ptIds.has(d)))];
  const [depStatus, ccRows] = await Promise.all([
    outside.length ? prisma.task.findMany({ where: { id: { in: outside } }, select: { id: true, status: true } }) : Promise.resolve([]),
    shownOpen.length ? prisma.comment.groupBy({ by: ["taskId"], where: { taskId: { in: shownOpen.map((t) => t.id) } }, _count: { _all: true } }) : Promise.resolve([]),
  ]);
  const ccount = new Map(ccRows.map((c) => [c.taskId, c._count._all]));
  const lc = lineCtx(ctx, [p], [...pt, ...depStatus], ccount);

  const od = open.filter((t) => t.dueDate && t.dueDate < t0).length;
  const activeRules = rules.filter((r) => r.active);
  const perMonth = plannedPerMonth(rules);

  const logsP = logRows.map((l) => ({ taskId: l.taskId, userId: l.userId, minutes: l._sum.minutes || 0 }));
  const cmBy = new Map(cmtRows.map((c) => [c.userId, c._count._all]));
  const due = pt.filter((t) => inP(t.dueDate) && t.status !== "CANCELLED"), dueSoFar = due.filter((t) => t.dueDate! <= t0);
  const doneP = pt.filter((t) => t.status === "DONE" && inP(t.doneOn));
  const onTime = doneP.filter((t) => !t.dueDate || t.doneOn! <= t.dueDate).length;
  const minsP = logsP.reduce((a, l) => a + l.minutes, 0);
  const rate = dueSoFar.length ? dueSoFar.filter((t) => t.status === "DONE").length / dueSoFar.length : null;
  const cadRows = FREQS.map((fq) => {
    const ts = pt.filter((t) => (t.frequency || "ONCE") === fq), tsIds = new Set(ts.map((t) => t.id));
    const d = ts.filter((t) => inP(t.dueDate) && t.status !== "CANCELLED"), ds = d.filter((t) => t.dueDate! <= t0), dn = ds.filter((t) => t.status === "DONE").length;
    const op = ts.filter((t) => !closed(t.status));
    return { fq, rules: activeRules.filter((r) => r.frequency === fq).length, due: d.length, done: d.filter((t) => t.status === "DONE").length, open: op.length, od: op.filter((t) => t.dueDate && t.dueDate < t0).length, rate: ds.length ? dn / ds.length : null, mins: logsP.filter((l) => tsIds.has(l.taskId)).reduce((a, l) => a + l.minutes, 0) };
  }).filter((x) => x.rules || x.due || x.open);
  const ppl = [...new Set([p.leadId, ...p.members, ...pt.map((t) => t.assigneeId), ...collabRows.map((c) => c.userId), ...logsP.map((l) => l.userId)].filter((x): x is string => !!x))].filter((x) => user(x));
  const contrib = ppl.map((uid) => {
    const mine = pt.filter((t) => t.assigneeId === uid), op = mine.filter((t) => !closed(t.status));
    return {
      id: uid, role: uid === p.leadId ? "Lead" : p.members.includes(uid) ? "Member" : "Helper",
      done: doneP.filter((t) => t.assigneeId === uid).length, open: op.length, od: op.filter((t) => t.dueDate && t.dueDate < t0).length,
      mins: logsP.filter((l) => l.userId === uid).reduce((a, l) => a + l.minutes, 0),
      cm: cmBy.get(uid) || 0,
    };
  }).sort((a, b) => b.done - a.done || b.mins - a.mins);
  const maxDone = Math.max(1, ...contrib.map((c) => c.done)), totDone = contrib.reduce((a, c) => a + c.done, 0);
  const months = [5, 4, 3, 2, 1, 0].map((i) => {
    const mk = addMonths(t0, -i).slice(0, 7);
    return { mk, done: pt.filter((t) => t.status === "DONE" && t.doneOn?.slice(0, 7) === mk).length, due: pt.filter((t) => t.dueDate?.slice(0, 7) === mk && t.status !== "CANCELLED").length };
  });
  const maxM = Math.max(1, ...months.map((m) => Math.max(m.done, m.due)));
  const lead = user(p.leadId);
  const people = userOpts(ctx);
  const client = p.clientLabel || "Internal";

  return (
    <>
      <Link className="link small" href="/projects" style={{ justifySelf: "start" }}>All projects</Link>
      <header className="phead">
        <Av name={p.name} size={56} />
        <div className="pmain">
          <div className="row" style={{ gap: "8px 10px" }}><h1>{p.name}</h1><span className={`chip ${p.status === "ACTIVE" ? "lv-APPROVED" : "lv-PENDING"}`}>{PSTATUS[p.status]}</span><span className="chip">{LINE[p.line]}</span></div>
          <p className="soft small">
            {p.clientId && isAdmin(me) ? <Link className="link" href={`/clients/${p.clientId}`}>{client}</Link> : client}, {p.industry || "Industry not set"}
            {lead ? <>, led by <Link className="link" href={`/people/${lead.id}`}>{lead.name}</Link></> : null}, {p.members.length} {p.members.length === 1 ? "person" : "people"}
          </p>
          {p.website ? <p className="xs"><a href={p.website} target="_blank" rel="noreferrer">{p.website.replace(/^https?:\/\//, "")}</a></p> : null}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-q btn-sm" href={`/reports?project=${p.id}`}><Icon name="reports" /> Report</Link>
          <Link className="btn btn-p btn-sm" href={`/tasks/new?project=${p.id}`}><Icon name="plus" /> New task</Link>
        </div>
      </header>

      <div className="between" style={{ alignItems: "center", gap: 10 }}>
        <div className="seg seg-sm" role="tablist" aria-label="Period">
          {PERIODS.map(([k, l]) => <Link key={k} role="tab" href={`/projects/${p.id}${k === "MONTH" ? "" : `?period=${k}`}`} aria-pressed={period === k} scroll={false}>{l}</Link>)}
        </div>
        <span className="xs muted">{period === "ALL" ? "Since the project started" : `${fmtShort(from)} to ${fmtShort(to)}`}</span>
      </div>
      <Stats cls="six" items={[
        ["Tasks due", due.length, "", `${pword}${dueSoFar.length !== due.length ? `, ${dueSoFar.length} so far` : ""}`],
        ["Completion", rate === null ? "None" : pct(rate), rate === null ? "" : rate >= 0.9 ? "t-moss" : rate < 0.7 ? "t-rust" : "", "done of due so far"],
        ["On time", doneP.length ? pct(onTime / doneP.length) : "None", "", `${onTime} of ${doneP.length} completed`],
        ["Open now", open.length, "", od ? <span className="t-rust">{od} overdue</span> : "None overdue"],
        ["Time logged", mins(minsP), "", pword],
        ["Planned per month", mins(Math.round(perMonth)), "", `${activeRules.length} recurring tasks`],
      ]} />

      <div className="pgrid">
        <section className="panel tcard"><div className="tsec"><div className="tsh"><h3>Tasks by cadence</h3><span className="xs muted">{pword}</span></div>
          {cadRows.length ? (
            <div className="tablebox"><table className="t tcompact">
              <thead><tr><th>Cadence</th><th className="r">Due</th><th className="r">Done</th><th className="r">Open now</th><th>Completion</th><th className="r">Time</th></tr></thead>
              <tbody>{cadRows.map((x) => (
                <tr key={x.fq}>
                  <td><Cad f={x.fq} /><div className="xs muted">{x.fq === "ONCE" ? "added by hand" : `${x.rules} ${x.rules === 1 ? "rule" : "rules"}`}</div></td>
                  <td className="r num">{x.due}</td>
                  <td className="r num t-moss">{x.done}</td>
                  <td className="r num">{x.open}{x.od ? <> <span className="t-rust xs">({x.od} late)</span></> : null}</td>
                  <td>{x.rate === null ? <span className="xs muted">None due yet</span> : <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><Bar value={x.rate} max={1} cls={x.rate >= 0.9 ? "good" : x.rate < 0.7 ? "bad" : ""} /><span className="xs num">{pct(x.rate)}</span></span>}</td>
                  <td className="r num xs">{mins(x.mins)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="xs muted">No tasks yet.</p>}
        </div></section>
        <section className="panel tcard"><div className="tsec"><div className="tsh"><h3>Done each month</h3><span className="xs muted">last 6 months, done of due</span></div>
          <div className="mchart">{months.map((m) => <div key={m.mk} title={`${fmtMonth(m.mk)}: ${m.done} done of ${m.due} due`}><span className="mdue" style={{ height: `${(m.due / maxM) * 100}%` }} /><span className="mdone" style={{ height: `${(m.done / maxM) * 100}%` }} /></div>)}</div>
          <div className="axis">{months.map((m) => <div key={m.mk}>{fmtMonth(m.mk).split(" ")[0].slice(0, 3)}<br /><b className="num">{m.done}</b><span className="muted">/{m.due}</span></div>)}</div>
          <p className="xs muted"><span className="key kdone" />Done <span className="key kdue" />Due</p>
        </div></section>
      </div>

      <section className="panel tcard"><div className="tsec"><div className="tsh"><h3>Who contributed</h3><span className="xs muted">{pword}, {totDone} tasks done, {mins(minsP)} logged</span></div>
        {contrib.length ? (
          <div className="tablebox"><table className="t tcompact" style={{ minWidth: 640 }}>
            <thead><tr><th>Person</th><th>Role</th><th className="r">Done</th><th>Share of done</th><th className="r">Open now</th><th className="r">Time logged</th><th className="r">Comments</th></tr></thead>
            <tbody data-clamp="list">{contrib.map((c) => (
              <tr key={c.id}>
                <td><Person u={user(c.id)} size={22} onLeave={ctx.onLeaveToday.has(c.id)} link /></td>
                <td className="small soft">{c.role}</td>
                <td className="r num t-moss">{c.done}</td>
                <td><span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><Bar value={c.done} max={maxDone} /><span className="xs num">{totDone ? Math.round((c.done / totDone) * 100) : 0}%</span></span></td>
                <td className="r num">{c.open}{c.od ? <> <span className="t-rust xs">({c.od} late)</span></> : null}</td>
                <td className="r num">{mins(c.mins)}</td>
                <td className="r num">{c.cm}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="xs muted">No one has worked on this project yet.</p>}
      </div></section>

      <section className="stack">
        <div className="between" style={{ alignItems: "center" }}>
          <div><h2>Recurring tasks</h2><p className="small muted">Created automatically up to a week ahead. Holidays skip daily routines and move the rest to the next working day.</p></div>
          {manage ? (
            <div className="row"><Link className="btn btn-p" href={`${withPanel("rule")}#newrule`}>New recurring task</Link><Link className="btn btn-q" href={`${withPanel("tpl")}#newtpl`}>Add from templates</Link></div>
          ) : <span className="small muted">Only the project lead or an admin can change these.</span>}
        </div>
        {panel === "rule" ? (
          <section className="panel pad stack" id="newrule">
            <div className="between" style={{ alignItems: "center" }}><h3>New recurring task</h3><Link className="x" href={base} aria-label="Close" scroll={false}>&times;</Link></div>
            <ActionForm action={addRule} className="stack">
              <input type="hidden" name="id" value={p.id} />
              <RuleFields defLine={p.line} people={people} today={t0} />
              <div className="row"><button className="btn btn-p">Create recurring task</button><Link className="btn btn-q" href={base} scroll={false}>Cancel</Link></div>
            </ActionForm>
          </section>
        ) : null}
        {panel === "tpl" ? (
          <section className="panel pad stack" id="newtpl">
            <div className="between" style={{ alignItems: "center" }}><h3>Add from templates</h3><Link className="x" href={base} aria-label="Close" scroll={false}>&times;</Link></div>
            <ActionForm action={addTemplates} className="stack">
              <input type="hidden" name="id" value={p.id} />
              <div className="grid2">
                <div><label className="lbl">Assign to</label><select className="field" name="assigneeId" defaultValue=""><Options opts={[["", "Project lead"], ...people]} /></select></div>
                <div><label className="lbl">Start date</label><input className="field" type="date" name="startDate" defaultValue={t0} /></div>
              </div>
              <TplPicker openLine={null} exclude={rules.map((r) => r.title)} />
              <div className="row"><button className="btn btn-p">Add selected</button><Link className="btn btn-q" href={base} scroll={false}>Cancel</Link></div>
            </ActionForm>
          </section>
        ) : null}
        {rules.length ? (
          <div className="panel tablebox"><table className="t" style={{ minWidth: 780 }}>
            <thead><tr><th>Routine</th><th>Schedule</th><th>Assignee</th><th>Priority</th><th className="r">Estimate</th>{manage ? <th className="r">Actions</th> : null}</tr></thead>
            <tbody data-clamp="list">{rules.map((r) => (
              <tr key={r.id} className={r.active ? "" : "dim"}>
                <td style={{ maxWidth: 320 }}>
                  <div style={{ fontWeight: 500 }}>{r.title}</div>
                  {r.checklist.length ? <div className="xs muted">{r.checklist.length} subtasks each time</div> : null}
                  {manage ? (
                    <Modal title="Edit recurring task" trigger="Edit" triggerClass="link small">
                      <ActionForm action={editRule} className="stack">
                        <input type="hidden" name="id" value={r.id} />
                        <RuleFields r={r} people={people} today={t0} />
                        <p className="xs muted">Saving replaces future occurrences that nobody has started.</p>
                        <div className="row"><button className="btn btn-p">Save recurring task</button><ModalCancel /></div>
                      </ActionForm>
                    </Modal>
                  ) : null}
                </td>
                <td><div className="stack" style={{ gap: 4, justifyItems: "start" }}><Cad f={r.frequency} /><span className="small soft">{describeRule(r)}</span>{r.active ? null : <b className="xs t-ochre">Paused</b>}</div></td>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{r.assigneeId ? user(r.assigneeId)?.name : <span className="muted">Project lead</span>}</td>
                <td><Pri p={r.priority} /></td>
                <td className="r num small">{r.estimate ? mins(r.estimate) : "None"}</td>
                {manage ? (
                  <td className="r"><div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 8 }}>
                    <ActionForm action={toggleRule}><input type="hidden" name="id" value={r.id} /><button className="btn btn-q btn-sm">{r.active ? "Pause" : "Resume"}</button></ActionForm>
                    <ActionForm action={deleteRule}><input type="hidden" name="id" value={r.id} /><ConfirmButton label="Delete" /></ActionForm>
                  </div></td>
                ) : null}
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>{manage ? "No recurring tasks yet. Use New recurring task or Add from templates." : "No recurring tasks yet."}</Empty>}
      </section>

      <section className="stack">
        <h2>Open tasks <span className="xs muted" style={{ fontWeight: 400 }}>{open.length}</span></h2>
        {open.length ? <TaskLines tasks={shownOpen} lc={lc} clamp project={false} assignee /> : <Empty>All clear. Nothing open on this project.</Empty>}
        {open.length > 60 ? <p className="small"><Link className="link" href={`/tasks?project=${p.id}&status=open`}>See all {open.length} open tasks</Link></p> : null}
      </section>

      <div className="grid3">
        <section className="panel pad stack"><h2>Client contact</h2>
          {p.poc.name ? (
            <div className="contact"><b>{p.poc.name}</b><span className="soft small">{p.poc.role}</span>
              {p.poc.phone ? <span className="row small" style={{ gap: 8 }}><a href={`tel:${p.poc.phone.replace(/\s/g, "")}`} className="num">{p.poc.phone}</a><CopyButton text={p.poc.phone} label="Copy phone number" /></span> : null}
              {p.poc.email ? <span className="small" style={{ wordBreak: "break-all" }}>{p.poc.email}</span> : null}
            </div>
          ) : <p className="small muted">No contact added.</p>}
          <div><span className="xs muted">Prefers</span><div className="row" style={{ gap: 6, marginTop: 4 }}>{p.comms.length ? <CommsChips list={p.comms} /> : <span className="small muted">Not set</span>}</div></div>
        </section>
        <section className="panel pad stack"><h2>Team</h2>
          <div className="stack" style={{ gap: 8 }} data-clamp="list">
            {p.members.map((m) => <div key={m} className="row small"><Person u={user(m)} size={26} onLeave={ctx.onLeaveToday.has(m)} /><span className="muted">{m === p.leadId ? "Project lead" : user(m)?.title || ""}</span></div>)}
          </div>
          {manage ? (
            <details><summary className="sumlink">Change team</summary>
              <ActionForm action={saveMembers} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={p.id} />
                <div className="checks" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
                  {ctx.active.map((x) => <label key={x.id} className="check"><input type="checkbox" name="m" value={x.id} defaultChecked={p.members.includes(x.id)} />{x.name}</label>)}
                </div>
                <div><button className="btn btn-p btn-sm">Save team</button></div>
              </ActionForm>
            </details>
          ) : null}
        </section>
        <section className="panel pad stack"><h2>Recent activity</h2>
          <ol className="feed" data-clamp="list">
            {feed.length ? feed.map((a) => <li key={a.id}><b>{user(a.userId)?.name || "System"}</b> {a.action}{a.detail ? <span className="soft">: {a.detail}</span> : null}<time>{fmtStamp(a.at)}</time></li>) : <li className="muted">No activity yet.</li>}
          </ol>
        </section>
      </div>

      {p.description ? <section className="panel pad stack"><h2>Scope and notes</h2><p style={{ whiteSpace: "pre-wrap" }} data-clamp="text">{p.description}</p></section> : null}

      {manage ? (
        <details className="panel"><summary>Project settings</summary><div className="body">
          <ActionForm action={saveProjectSettings} className="stack">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid2">
              <div><label className="lbl">Project name</label><input className="field" name="name" defaultValue={p.name} required /></div>
              {isAdmin(me) ? (
                <div><label className="lbl">Client</label><select className="field" name="clientId" defaultValue={p.clientId || ""}><Options opts={[["", "Internal (no client)"], ...clients.map((c): [string, string] => [c.id, c.name])]} /></select></div>
              ) : !p.clientId ? (
                <div><label className="lbl">Client</label><input className="field" name="clientLabel" defaultValue={p.clientLabel} placeholder="Leave empty for internal work" /></div>
              ) : null}
              {isAdmin(me) ? <div><label className="lbl">Client name if not in the list</label><input className="field" name="clientLabel" defaultValue={p.clientId ? "" : p.clientLabel} placeholder="Used when no client is picked" /></div> : null}
              <div><label className="lbl">Industry</label><select className="field" name="industry" defaultValue={p.industry}><Options opts={INDUSTRIES.map((i) => [i, i])} /></select></div>
              <div><label className="lbl">Website</label><input className="field" name="website" type="url" defaultValue={p.website} /></div>
              <div><label className="lbl">Main service line</label><select className="field" name="line" defaultValue={p.line}><Options opts={LINES.map((x) => [x, LINE[x]])} /></select></div>
              <div><label className="lbl">Status</label><select className="field" name="status" defaultValue={p.status}><Options opts={Object.entries(PSTATUS)} /></select><p className="xs muted" style={{ marginTop: 4 }}>Paused and archived projects stop creating recurring tasks.</p></div>
              {isAdmin(me) ? <div><label className="lbl">Project lead</label><select className="field" name="leadId" defaultValue={p.leadId || ""}><Options opts={ctx.active.filter((x) => x.role !== "MEMBER").map((x): [string, string] => [x.id, x.name])} /></select></div> : null}
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack"><legend className="lbl">Client contact</legend>
              <div className="grid4">
                <div><label className="lbl">Name</label><input className="field" name="poc_name" defaultValue={p.poc.name} /></div>
                <div><label className="lbl">Position</label><input className="field" name="poc_role" defaultValue={p.poc.role} /></div>
                <div><label className="lbl">Phone</label><input className="field" name="poc_phone" defaultValue={p.poc.phone} /></div>
                <div><label className="lbl">Email</label><input className="field" type="email" name="poc_email" defaultValue={p.poc.email} /></div>
              </div>
              <div><span className="lbl">Preferred way to communicate</span><CommsBoxes name="comms" selected={p.comms} /></div>
            </fieldset>
            <div><label className="lbl">Scope and notes</label><textarea className="field" name="description" rows={3} defaultValue={p.description} /></div>
            <div><button className="btn btn-p">Save settings</button></div>
          </ActionForm>
        </div></details>
      ) : null}
    </>
  );
}
