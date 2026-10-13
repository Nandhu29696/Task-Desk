import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { HTYPE, LIVE_STAGES, LTYPE, OPEN, PRIORITIES, PRIORITY, RENEW_LINES, SLOT, SVC, DAY_CAPACITY, closed } from "@/lib/constants";
import { addK, diffK, dueLabel, fmtLong, fmtShort, fmtTime, inr, mins, monthEnd, monthStart, stampOf } from "@/lib/dates";
import { anyHolidayOn, leaveDays } from "@/lib/calendar";
import { dayAttendance } from "@/lib/attendance";
import { isAdmin } from "@/lib/permissions";
import { recurringMonthly, sortTasks, svcLive } from "@/lib/logic";
import { loadLeaves, loadProjects, loadSessions, loadTasks, parseJson, type T } from "@/lib/model";
import { addToPlan, clearPlan, planForMe, quickAdd, removeFromPlan, setPlanSlot } from "@/app/actions/dashboard";
import { decideApproval, toggleSubtask } from "@/app/actions/tasks";
import { ActionForm, AutoSubmit } from "@/components/client/ActionForm";
import { MiniLine, lineCtx, type LineCtx } from "@/components/tasklines";
import { NotifItem } from "@/components/notif";
import { Icon } from "@/components/Icon";
import { Person } from "@/components/ui";

function Widget({ icon, title, href, children, cls = "" }: { icon: string; title: string; href?: string | null; children: ReactNode; cls?: string }) {
  return (
    <section className={`panel widget ${cls}`}>
      <header className="whead"><span className="wico"><Icon name={icon} /></span><h2>{title}</h2>{href ? <Link className="link small" href={href}>Open</Link> : null}</header>
      <div className="wbody">{children}</div>
    </section>
  );
}

type Svc = { id: string; line: string; type: string; price: number; cycle: string | null; startDate: string; completedDate: string; item: string; provider: string; renewDate: string };
type ClientRow = { id: string; name: string; stage: string; ownerId: string | null; services: Svc[] };

/** Domain, hosting and AMC renewals in the next 30 days (preview productRenewals). */
function productRenewals(clients: ClientRow[], today: string, ownerId: string | null) {
  return clients
    .filter((c) => c.stage !== "CHURNED" && (!ownerId || c.ownerId === ownerId))
    .flatMap((c) => c.services.filter((s) => !!s.renewDate && RENEW_LINES.includes(s.line) && svcLive(s, today) && s.renewDate >= today && diffK(s.renewDate, today) <= 30).map((s) => ({ c, s })))
    .sort((a, b) => (a.s.renewDate < b.s.renewDate ? -1 : 1));
}

export default async function Dashboard() {
  const ctx = await getCtx();
  const { me, today: t0, cal } = ctx;
  const admin = isAdmin(me);
  const week = addK(t0, 7), yr = t0.slice(0, 4);
  const hr = Number(ctx.now.slice(11, 13));
  const mineWhere = { OR: [{ assigneeId: me.id }, { collaborators: { some: { userId: me.id } } }] };

  const [openRaw, planRow, subTasks, sessions, approvals, leaveQ, myLeaves, teamLeaveAll, projects, dueMonth, timeMonth, unreadPol, notifs, clients, tools] = await Promise.all([
    loadTasks({ status: { in: OPEN }, ...mineWhere }),
    prisma.dayPlan.findUnique({ where: { userId_date: { userId: me.id, date: t0 } } }),
    loadTasks({ status: { in: OPEN }, OR: [{ assigneeId: null }, { assigneeId: { not: me.id } }], subtasks: { some: { assigneeId: me.id, done: false } } }),
    loadSessions({ userId: me.id, day: t0 }),
    prisma.taskApproval.findMany({ where: { approverId: me.id, status: "PENDING" }, include: { task: { select: { id: true, title: true } } }, orderBy: { createdAt: "asc" } }),
    admin ? prisma.leave.count({ where: { status: "PENDING", userId: { not: me.id } } }) : Promise.resolve(0),
    loadLeaves({ userId: me.id, status: "APPROVED", toDate: { gte: `${yr}-01-01` } }),
    loadLeaves({ status: "APPROVED", toDate: { gte: t0 }, fromDate: { lte: addK(t0, 14) }, userId: { not: me.id } }),
    loadProjects(),
    prisma.task.findMany({ where: { assigneeId: me.id, dueDate: { gte: monthStart(t0), lte: t0 }, status: { not: "CANCELLED" } }, select: { status: true } }),
    prisma.timeLog.aggregate({ _sum: { minutes: true }, where: { userId: me.id, workDate: { gte: monthStart(t0), lte: monthEnd(t0) } } }),
    prisma.policy.findMany({ where: { acks: { none: { userId: me.id } } }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true } }),
    prisma.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 5, include: { from: { select: { name: true } } } }),
    prisma.client.findMany({ where: admin ? {} : { ownerId: me.id }, select: { id: true, name: true, stage: true, ownerId: true, services: true } }),
    prisma.tool.findMany({ where: { url: { not: "" } }, orderBy: { createdAt: "asc" }, take: 8, select: { id: true, name: true, url: true } }),
  ]);

  // Plan items, the tasks they point to, and statuses of linked tasks for the Waiting chips
  const items = parseJson<{ taskId: string; slot: string }[]>(planRow?.items, []).filter((i) => i && SLOT[i.slot]);
  const known = new Map<string, T>([...openRaw, ...subTasks].map((t) => [t.id, t]));
  const missing = items.map((i) => i.taskId).filter((id) => !known.has(id));
  if (missing.length) for (const t of await loadTasks({ id: { in: missing } })) known.set(t.id, t);
  const depIds = [...new Set([...known.values()].flatMap((t) => t.deps))].filter((id) => !known.has(id));
  const depStatus = depIds.length ? await prisma.task.findMany({ where: { id: { in: depIds } }, select: { id: true, status: true } }) : [];
  const myProjects = projects.filter((p) => p.status === "ACTIVE" && (p.members.includes(me.id) || p.leadId === me.id));
  const projOpen = myProjects.length ? await prisma.task.findMany({ where: { projectId: { in: myProjects.map((p) => p.id) }, status: { in: OPEN } }, select: { projectId: true, dueDate: true } }) : [];
  const lc: LineCtx = lineCtx(ctx, projects, [...[...known.values()].map((t) => ({ id: t.id, status: t.status })), ...depStatus]);

  const open = sortTasks(openRaw);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < t0);
  const dueToday = open.filter((t) => t.dueDate === t0);
  const upcoming = open.filter((t) => t.dueDate && t.dueDate > t0 && t.dueDate < week);
  const planned = items.map((i) => ({ ...i, t: known.get(i.taskId) })).filter((x): x is { taskId: string; slot: string; t: T } => !!x.t);
  const plannedMin = planned.reduce((a, x) => a + (closed(x.t.status) ? 0 : x.t.estimate || 30), 0);
  const doneMin = planned.filter((x) => x.t.status === "DONE").reduce((a, x) => a + (x.t.estimate || 30), 0);
  const cap = DAY_CAPACITY;
  const candidates = open.filter((t) => !items.some((i) => i.taskId === t.id) && (!t.dueDate || t.dueDate <= addK(t0, 3)));
  const hol = anyHolidayOn(cal, t0);
  const myLeave = myLeaves.find((l) => l.from <= t0 && l.to >= t0);
  const att = dayAttendance(sessions, me.id, t0, t0, ctx.now);
  const mySubs = subTasks.flatMap((t) => t.subtasks.filter((s) => s.assigneeId === me.id && !s.done).map((s) => ({ s, t })));
  const usedL = (type: string) => myLeaves.filter((l) => l.type === type && l.from.startsWith(yr)).reduce((a, l) => a + leaveDays(cal, l), 0);
  const nextHol = cal.holidays.filter((h) => h.date >= t0 && h.date <= addK(t0, 30)).slice(0, 4);
  const teamLeave = teamLeaveAll.slice(0, 4);
  const doneMonth = dueMonth.filter((t) => t.status === "DONE").length;
  const pr = productRenewals(clients, t0, admin ? null : me.id);
  const defSlot = hr < 12 ? "MORNING" : hr < 16 ? "AFTERNOON" : "EVENING";

  const slotCol = (k: string) => {
    const its = planned.filter((x) => x.slot === k);
    return (
      <div className="slot" key={k}>
        <div className="slothead">{SLOT[k]}<span className="xs muted num">{mins(its.reduce((a, x) => a + (x.t.estimate || 30), 0))}</span></div>
        {its.length ? (
          <ul className="minilist">{its.map((x) => (
            <MiniLine key={x.t.id} t={x.t} lc={lc} extra={
              <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <ActionForm action={setPlanSlot} quiet style={{ display: "contents" }} key={x.slot}>
                  <input type="hidden" name="id" value={x.t.id} />
                  <AutoSubmit className="fsm" name="slot" defaultValue={k} aria-label="Move to">{Object.entries(SLOT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</AutoSubmit>
                </ActionForm>
                <ActionForm action={removeFromPlan} quiet style={{ display: "contents" }}>
                  <input type="hidden" name="id" value={x.t.id} />
                  <button className="iconbtn sm" title="Remove from plan" aria-label="Remove from plan"><Icon name="close" /></button>
                </ActionForm>
              </div>
            } />
          ))}</ul>
        ) : <p className="xs muted" style={{ padding: "6px 2px" }}>Nothing planned.</p>}
      </div>
    );
  };

  const live = clients.filter((c) => LIVE_STAGES.includes(c.stage));

  return (
    <>
      <header className="between"><div>
        <p className="soft">{hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"}, {me.name.split(" ")[0]}{att ? `. Signed in at ${fmtTime(att.first)}` : ""}</p>
        <h1>{fmtLong(t0)}</h1>
      </div></header>
      {hol.length ? <div className="banner warn"><span className="chip chip-hol">{HTYPE[hol[0].type]}</span><span>Today is {hol[0].name}.{hol[0].type !== "RESTRICTED" ? " Daily routines are skipped and other recurring tasks move to the next working day." : ""}</span></div> : null}
      {myLeave ? <div className="banner warn"><span className="chip chip-leave">On leave</span><span>You are on {(LTYPE[myLeave.type] || "leave").toLowerCase()} today.</span></div> : null}
      {pr.length ? (
        <div className="banner warn"><span className="chip chip-hol">Renewals</span>
          <span>{pr.length} domain, hosting or AMC {pr.length === 1 ? "renewal is" : "renewals are"} due in the next 30 days: {pr.slice(0, 3).map(({ s }) => `${s.item || SVC[s.line]} on ${fmtShort(s.renewDate)}`).join(", ")}{pr.length > 3 ? " and more" : ""}.</span>
          {admin ? <><span className="grow" /><Link className="btn btn-q btn-sm" href="/clients">View</Link></> : null}
        </div>
      ) : null}
      <div className="dash">
        <Widget icon="myday" title="Plan my day" cls="wide">
          <div className="between" style={{ alignItems: "center", gap: 10 }}>
            <span className="small soft"><b className="num">{mins(plannedMin)}</b> left of <span className="num">{mins(cap)}</span> working day{doneMin ? <>, <span className="t-moss">{mins(doneMin)} done</span></> : null}</span>
            <div className="row" style={{ gap: 8 }}>
              <ActionForm action={planForMe} style={{ display: "contents" }}><button className="btn btn-q btn-sm"><Icon name="myday" /> Plan for me</button></ActionForm>
              {planned.length ? <ActionForm action={clearPlan} style={{ display: "contents" }}><button className="btn btn-q btn-sm">Clear</button></ActionForm> : null}
            </div>
          </div>
          <div className="bar" style={{ flex: "none", height: 10 }}><span style={{ width: `${Math.min(100, Math.round(((plannedMin + doneMin) / cap) * 100))}%`, background: plannedMin + doneMin > cap ? "var(--rust)" : "var(--brand)" }} /></div>
          {plannedMin + doneMin > cap ? <p className="xs t-rust">More than a working day is planned. Move something to tomorrow.</p> : null}
          <div className="slots">{Object.keys(SLOT).map(slotCol)}</div>
          {candidates.length ? (
            <ActionForm action={addToPlan} reset className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select className="field" name="taskId" style={{ flex: 1, minWidth: 220 }} aria-label="Task to plan">
                {candidates.map((t) => <option key={t.id} value={t.id}>{`${t.title} (${dueLabel(t.dueDate, t0)}${t.estimate ? ", " + mins(t.estimate) : ""})`}</option>)}
              </select>
              <select className="field" name="slot" style={{ width: "auto" }} aria-label="When" defaultValue={defSlot}>{Object.entries(SLOT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button className="btn btn-p">Add to plan</button>
            </ActionForm>
          ) : <p className="xs muted">All your tasks due in the next 3 days are planned.</p>}
        </Widget>

        <Widget icon="tasks" title="Today" href="/tasks">
          {overdue.length ? <><p className="small t-rust" style={{ fontWeight: 600 }}>{overdue.length} overdue</p><ul className="minilist">{overdue.slice(0, 3).map((t) => <MiniLine key={t.id} t={t} lc={lc} />)}</ul></> : null}
          {dueToday.length ? <><p className="small soft" style={{ fontWeight: 600 }}>{dueToday.length} due today</p><ul className="minilist">{dueToday.slice(0, 6).map((t) => <MiniLine key={t.id} t={t} lc={lc} />)}</ul></> : <p className="small muted">Nothing due today.</p>}
          {mySubs.length ? (
            <><p className="small soft" style={{ fontWeight: 600 }}>{mySubs.length} subtasks for you</p>
              <ul className="minilist">{mySubs.slice(0, 3).map(({ s, t }) => (
                <li className="mini" key={s.id}>
                  <ActionForm action={toggleSubtask} style={{ display: "contents" }}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="tick" aria-label={`Mark subtask done: ${s.title}`} />
                  </ActionForm>
                  <div className="tl-main"><span>{s.title}</span><div className="tl-meta">in <Link className="link" href={`/tasks/${t.id}`}>{t.title}</Link></div></div>
                </li>
              ))}</ul></>
          ) : null}
        </Widget>

        <Widget icon="calendar" title="This week" href="/tasks">
          {upcoming.length ? <><ul className="minilist">{upcoming.slice(0, 7).map((t) => <MiniLine key={t.id} t={t} lc={lc} />)}</ul>{upcoming.length > 7 ? <p className="xs muted">and {upcoming.length - 7} more</p> : null}</> : <p className="small muted">Nothing else in the next 7 days.</p>}
        </Widget>

        <Widget icon="bell" title="Notifications" href="/notifications">
          {notifs.length ? <ul className="nlist">{notifs.map((n) => <NotifItem key={n.id} compact n={{ id: n.id, kind: n.kind, title: n.title, body: n.body, at: stampOf(n.createdAt)!, read: !!n.readAt, from: n.from?.name || null }} />)}</ul> : <p className="small muted">You&apos;re all caught up.</p>}
        </Widget>

        {approvals.length || leaveQ ? (
          <Widget icon="check" title="Waiting for your approval" href={leaveQ ? "/leave" : null}>
            {approvals.map((a) => (
              <div className="apr" key={a.id}>
                <div><Link className="link" href={`/tasks/${a.task.id}`}>{a.task.title}</Link><div className="xs soft">{a.note || "Approval needed"}, asked by {ctx.user(a.requestedById)?.name || "someone"}</div></div>
                <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  <ActionForm action={decideApproval} style={{ display: "contents" }}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn btn-p btn-sm" name="status" value="APPROVED">Approve</button>
                    <button className="btn btn-d btn-sm" name="status" value="REJECTED">Reject</button>
                  </ActionForm>
                </div>
              </div>
            ))}
            {leaveQ ? <p className="small"><Link className="link" href="/leave">{leaveQ} leave {leaveQ === 1 ? "request" : "requests"} to review.</Link></p> : null}
          </Widget>
        ) : null}

        <Widget icon="attendance" title="Attendance and leave" href="/leave">
          <dl className="kv">
            <dt>Signed in</dt><dd className="num">{att ? fmtTime(att.first) : "Not yet"}</dd>
            <dt>Time today</dt><dd className="num">{att ? mins(att.minutes) : "0m"}</dd>
            {Object.entries(cal.settings.allow).map(([k, n]) => <DtDd key={k} dt={LTYPE[k] || k} dd={`${n - usedL(k)} of ${n} left`} />)}
          </dl>
          <div><Link className="btn btn-q btn-sm" href="/leave">Request leave</Link></div>
        </Widget>

        <Widget icon="calendar" title="Holidays and team leave" href="/calendar">
          {nextHol.length ? <ul className="feed">{nextHol.map((h) => <li key={h.id} className="between" style={{ alignItems: "center" }}><span>{h.name} <span className={`chip ${h.type === "RESTRICTED" ? "chip-rh" : "chip-hol"}`}>{h.type === "RESTRICTED" ? "Restricted" : "Holiday"}</span></span><span className="small num">{fmtShort(h.date)}</span></li>)}</ul> : <p className="small muted">No holidays in the next 30 days.</p>}
          {teamLeave.length ? <><p className="small soft" style={{ fontWeight: 600, marginTop: 4 }}>Team on leave</p><ul className="feed">{teamLeave.map((l) => <li key={l.id} className="between" style={{ alignItems: "center" }}><Person u={ctx.user(l.userId)} size={20} /><span className="small num">{l.from === l.to ? fmtShort(l.from) : `${fmtShort(l.from)} to ${fmtShort(l.to)}`}</span></li>)}</ul></> : null}
        </Widget>

        <Widget icon="projects" title="My projects" href="/projects">
          {myProjects.length ? <ul className="feed">{myProjects.map((p) => {
            const o = projOpen.filter((t) => t.projectId === p.id); const od = o.filter((t) => t.dueDate && t.dueDate < t0).length;
            return <li key={p.id} className="between" style={{ alignItems: "center" }}><Link className="link" href={`/projects/${p.id}`}>{p.name}</Link><span className="small num">{o.length} open{od ? <>, <span className="t-rust">{od} overdue</span></> : null}</span></li>;
          })}</ul> : <p className="small muted">You are not on any project yet.</p>}
        </Widget>

        <Widget icon="reports" title="This month" href="/reports">
          <div className="bignum"><b className="num">{dueMonth.length ? Math.round((doneMonth / dueMonth.length) * 100) : 0}%</b><span className="small soft">of your tasks due so far are done</span></div>
          <dl className="kv"><dt>Done</dt><dd className="num">{doneMonth} of {dueMonth.length}</dd><dt>Overdue now</dt><dd className={`num ${overdue.length ? "t-rust" : ""}`}>{overdue.length}</dd><dt>Time logged</dt><dd className="num">{mins(timeMonth._sum.minutes || 0)}</dd></dl>
        </Widget>

        {unreadPol.length ? (
          <Widget icon="policies" title="Policies to read" href="/policies">
            <ul className="feed">{unreadPol.map((x) => <li key={x.id} className="between" style={{ alignItems: "center" }}><span>{x.title}</span><Link className="btn btn-q btn-sm" href={`/policies?id=${x.id}`}>Read</Link></li>)}</ul>
          </Widget>
        ) : null}

        {admin ? (
          <Widget icon="clients" title="Clients" href="/clients">
            <dl className="kv">
              <dt>Active clients</dt><dd className="num">{live.length}</dd>
              <dt>Monthly recurring</dt><dd className="num t-moss">{inr(live.reduce((a, c) => a + recurringMonthly(c, t0), 0))}</dd>
              <dt>In pipeline</dt><dd className="num">{clients.filter((c) => ["LEAD", "PROPOSAL", "NEGOTIATION"].includes(c.stage)).length}</dd>
              <dt>Renewals in 30 days</dt><dd className={`num ${pr.length ? "t-ochre" : ""}`}>{pr.length}</dd>
            </dl>
          </Widget>
        ) : null}

        <Widget icon="tools" title="Quick links" href="/tools">
          <div className="qlinks">{tools.map((t) => <a key={t.id} href={t.url} target="_blank" rel="noreferrer">{t.name}</a>)}</div>
        </Widget>

        <Widget icon="plus" title="Quick add">
          <ActionForm action={quickAdd} reset className="stack" style={{ gap: 8 }}>
            <input className="field" name="title" required placeholder="Fix broken canonical on the pricing page" aria-label="Task" />
            <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
              <select className="field" name="projectId" aria-label="Project" style={{ minWidth: 0 }} defaultValue=""><option value="">No project</option>{projects.filter((p) => p.status === "ACTIVE").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input className="field" type="date" name="dueDate" defaultValue={t0} aria-label="Due" style={{ width: "auto" }} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <select className="field" name="priority" style={{ width: "auto" }} aria-label="Priority" defaultValue="MEDIUM">{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY[p]}</option>)}</select>
              <button className="btn btn-p">Add task</button>
            </div>
          </ActionForm>
        </Widget>
      </div>
    </>
  );
}

const DtDd = ({ dt, dd }: { dt: string; dd: string }) => <><dt>{dt}</dt><dd className="num">{dd}</dd></>;
