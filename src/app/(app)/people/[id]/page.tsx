import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { EMPTYPE, OPEN, ROLE } from "@/lib/constants";
import { addK, fmtShort, fmtTime, fromLocal, mins, monthStart, startOfWeek } from "@/lib/dates";
import { isWorking } from "@/lib/calendar";
import { dayAttendance } from "@/lib/attendance";
import { sortTasks } from "@/lib/logic";
import { canEditPerson, canSeeLog } from "@/lib/permissions";
import { loadProjects, loadSessions, loadTasks } from "@/lib/model";
import { Icon } from "@/components/Icon";
import { Av, Empty, Person, Stats } from "@/components/ui";
import { MiniLine, lineCtx } from "@/components/tasklines";
import { EditPersonModal } from "@/components/people/forms";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const u = ctx.me, x = ctx.user(id);
  if (!x) return <Empty>This person was not found.</Empty>;
  const t0 = ctx.today, ws = startOfWeek(t0);

  const [openRaw, recentRaw, doneM, logged, sessToday, projs] = await Promise.all([
    loadTasks({ assigneeId: id, status: { in: OPEN } }),
    loadTasks({ assigneeId: id, status: "DONE", completedAt: { gte: fromLocal(addK(t0, -30)) } }),
    prisma.task.count({ where: { assigneeId: id, status: "DONE", completedAt: { gte: fromLocal(monthStart(t0)) } } }),
    prisma.timeLog.aggregate({ where: { userId: id, workDate: { gte: ws } }, _sum: { minutes: true } }),
    loadSessions({ userId: id, day: t0 }),
    loadProjects({ status: { not: "ARCHIVED" }, OR: [{ leadId: id }, { members: { some: { userId: id } } }] }),
  ]);
  const open = sortTasks(openRaw);
  const recent = [...recentRaw].sort((a, b) => ((a.completedAt || "") < (b.completedAt || "") ? 1 : -1));
  const overdue = open.filter((t) => t.dueDate && t.dueDate < t0).length;
  const loggedW = logged._sum.minutes || 0;
  const att = dayAttendance(sessToday, id, t0, t0, ctx.now);

  const depIds = [...new Set([...open, ...recent].flatMap((t) => t.deps))];
  const depRows = depIds.length ? await prisma.task.findMany({ where: { id: { in: depIds } }, select: { id: true, status: true } }) : [];
  const allProjects = await loadProjects();
  const lc = lineCtx(ctx, allProjects, depRows);

  const boss = x.reportsTo ? ctx.user(x.reportsTo) : undefined;
  const team = ctx.active.filter((y) => y.reportsTo === id);
  const asPerson = { id: x.id, role: x.role, reportsTo: x.reportsTo, addedBy: x.addedBy };
  const onLeave = ctx.onLeaveToday.has(x.id);

  return (
    <>
      <header className="phead">
        <Av name={x.name} size={56} />
        <div className="pmain">
          <div className="row" style={{ gap: "8px 10px" }}>
            <h1>{x.name}{x.id === u.id ? <> <span className="soft" style={{ fontSize: 16, fontWeight: 500 }}>(you)</span></> : null}</h1>
            <span className={`role role-${x.role}`}>{ROLE[x.role]}</span>
            <span className={`chip emp-${x.emp}`}>{EMPTYPE[x.emp] || ""}</span>
            {x.active ? null : <span className="chip lv-CANCELLED">Inactive</span>}
            {onLeave ? <span className="chip chip-leave">On leave</span> : null}
          </div>
          <p className="soft small">{x.title || ROLE[x.role]}{x.location ? `, ${x.location}` : ""}{boss ? <>, reports to <Link className="link" href={`/people/${boss.id}`}>{boss.name}</Link></> : null}</p>
          <p className="xs muted"><a href={`tel:${x.phone.replace(/\s/g, "")}`}>{x.phone || "No number"}</a>, {x.email}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {canSeeLog(u, asPerson) ? <Link className="btn btn-q btn-sm" href={`/activity?who=${x.id}`}><Icon name="activity" /> Activity log</Link> : null}
          {x.id === u.id ? <Link className="btn btn-q btn-sm" href="/people?edit=me">Edit my details</Link> : null}
          {canEditPerson(u, asPerson) && x.id !== u.id ? <EditPersonModal x={x} ctx={ctx} label="Edit" /> : null}
          <Link className="btn btn-q btn-sm" href={`/tasks?assignee=${x.id}`}><Icon name="tasks" /> All tasks</Link>
        </div>
      </header>
      <Stats cls="four pstats" items={[
        ["Open tasks", open.length, "", overdue ? <span className="t-rust">{overdue} overdue</span> : "None overdue"],
        ["Done this month", doneM, "t-moss"],
        ["Logged this week", mins(loggedW)],
        ["Today", att ? `In ${fmtTime(att.first)}` : onLeave ? "On leave" : isWorking(ctx.cal, t0) ? "Not signed in" : "Day off", "", att ? `${mins(att.minutes)} so far` : ""],
      ]} />
      <div className="tgrid">
        <div className="tmain">
          <section className="panel tcard"><div className="tsec">
            <div className="tsh"><h3>Working on</h3><span className="xs muted">{open.length} open</span></div>
            {open.length ? <ul className="minilist" data-clamp="list">{open.map((t) => <MiniLine key={t.id} t={t} lc={lc} />)}</ul> : <p className="xs muted">No open tasks.</p>}
          </div></section>
          <section className="panel tcard"><div className="tsec">
            <div className="tsh"><h3>Completed in the last 30 days</h3><span className="xs muted">{recent.length}</span></div>
            {recent.length ? <ul className="minilist" data-clamp="list">{recent.map((t) => <MiniLine key={t.id} t={t} lc={lc} extra={<span className="xs muted num" style={{ whiteSpace: "nowrap" }}>{fmtShort(t.completedAt!.slice(0, 10))}</span>} />)}</ul> : <p className="xs muted">Nothing completed recently.</p>}
          </div></section>
        </div>
        <aside className="panel tside">
          <div className="tsec">
            <div className="tsh"><h3>Projects</h3><span className="xs muted">{projs.length}</span></div>
            <div data-clamp="list" className="plist">{projs.length ? projs.map((p) => <Link key={p.id} className="link small tclip" href={`/projects/${p.id}`}>{p.name}{p.leadId === id ? <> <span className="xs muted">(lead)</span></> : null}</Link>) : <p className="xs muted">Not on any project.</p>}</div>
          </div>
          {team.length ? (
            <div className="tsec">
              <div className="tsh"><h3>Reports to {x.name.split(" ")[0]}</h3><span className="xs muted">{team.length}</span></div>
              <div data-clamp="list" className="plist">{team.map((y) => <Person key={y.id} u={y} link onLeave={ctx.onLeaveToday.has(y.id)} />)}</div>
            </div>
          ) : null}
          <div className="tsec"><dl className="kv tkv">
            <dt>Email</dt><dd style={{ wordBreak: "break-all" }}>{x.email}</dd>
            <dt>Phone</dt><dd>{x.phone || "Not added"}</dd>
            <dt>Location</dt><dd>{x.location || "Not added"}</dd>
            <dt>Type</dt><dd>{EMPTYPE[x.emp] || ""}</dd>
          </dl></div>
        </aside>
      </div>
    </>
  );
}
