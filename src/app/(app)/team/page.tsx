import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { LTYPE, OPEN, ROLE } from "@/lib/constants";
import { fmtStamp, fmtTime, fromLocal, mins, startOfWeek, stampOf } from "@/lib/dates";
import { holidayOn, isWorking } from "@/lib/calendar";
import { dayAttendance } from "@/lib/attendance";
import { sortTasks } from "@/lib/logic";
import { canAddPeople, canSeeLog, isAdmin } from "@/lib/permissions";
import { loadLeaves, loadProjects, loadSessions, loadTasks } from "@/lib/model";
import { Av } from "@/components/ui";
import { TaskLine, lineCtx } from "@/components/tasklines";
import { AddPersonModal } from "@/components/people/forms";

export default async function TeamPage() {
  const ctx = await getCtx();
  const t0 = ctx.today, ws = startOfWeek(t0), cur = ctx.me;
  const users = ctx.active;
  const ids = users.map((u) => u.id);

  const [openTasks, doneW, loggedW, sessToday, leavesToday, projects, acts] = await Promise.all([
    loadTasks({ assigneeId: { in: ids }, status: { in: OPEN } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: ids }, status: "DONE", completedAt: { gte: fromLocal(ws) } }, _count: { _all: true } }),
    prisma.timeLog.groupBy({ by: ["userId"], where: { userId: { in: ids }, workDate: { gte: ws } }, _sum: { minutes: true } }),
    loadSessions({ day: t0 }),
    loadLeaves({ status: "APPROVED", fromDate: { lte: t0 }, toDate: { gte: t0 } }),
    loadProjects(),
    prisma.activity.findMany({ where: isAdmin(cur) ? {} : { userId: { in: ctx.users.filter((x) => canSeeLog(cur, x)).map((x) => x.id) } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, userId: true, action: true, detail: true, taskId: true, projectId: true, createdAt: true, task: { select: { id: true, title: true } }, project: { select: { id: true, name: true } } } }),
  ]);
  const focus = openTasks.filter((t) => t.dueDate && t.dueDate <= t0 && t.assigneeId);
  const depIds = [...new Set(focus.flatMap((t) => t.deps))];
  const depRows = depIds.length ? await prisma.task.findMany({ where: { id: { in: depIds } }, select: { id: true, status: true } }) : [];
  const lc = lineCtx(ctx, projects, depRows);
  const doneBy = new Map(doneW.map((r) => [r.assigneeId, r._count._all]));
  const loggedBy = new Map(loggedW.map((r) => [r.userId, r._sum.minutes || 0]));
  const feed = acts.filter((a) => (a.userId ? canSeeLog(cur, ctx.user(a.userId)) : isAdmin(cur))).slice(0, 30);
  const working = isWorking(ctx.cal, t0), hol = holidayOn(ctx.cal, t0);

  const todayCell = (id: string) => {
    const lv = leavesToday.find((l) => l.userId === id);
    if (lv) return <span className="chip chip-leave">{LTYPE[lv.type]}</span>;
    if (!working) return <span className="muted small">{hol ? hol.name : "Weekly off"}</span>;
    const a = dayAttendance(sessToday, id, t0, t0, ctx.now);
    return a ? <span className="small num">In {fmtTime(a.first)}{a.last ? `, out ${fmtTime(a.last)}` : ""}</span> : <span className="small muted">Not signed in</span>;
  };

  const attention = users.map((u) => [u, sortTasks(focus.filter((t) => t.assigneeId === u.id))] as const).filter(([, m]) => m.length);

  return (
    <>
      <header className="between">
        <div><h1>Team</h1><p className="soft">Who is in, who is on leave, and what needs attention today.</p></div>
        {canAddPeople(cur) ? <AddPersonModal ctx={ctx} /> : null}
      </header>
      <div className="panel tablebox"><table className="t" style={{ minWidth: 820 }}>
        <thead><tr><th>Person</th><th>Today</th><th className="r">Overdue</th><th className="r">Due today</th><th className="r">Open</th><th className="r">Done this week</th><th className="r">Logged this week</th></tr></thead>
        <tbody>
          {users.map((u) => {
            const mine = focus.filter((t) => t.assigneeId === u.id);
            const od = mine.filter((t) => t.dueDate! < t0).length;
            const open = openTasks.filter((t) => t.assigneeId === u.id).length;
            return (
              <tr key={u.id}>
                <td><Link className="link" href={`/people/${u.id}`} style={{ color: "var(--ink)" }} title="Profile and activity log"><span className="person"><Av name={u.name} size={28} /><span style={{ textAlign: "left" }}><b style={{ display: "block" }}>{u.name}{u.id === cur.id ? " (you)" : ""}</b><span className="xs muted">{u.title || ROLE[u.role]}</span></span></span></Link></td>
                <td>{todayCell(u.id)}</td>
                <td className={`r num ${od ? "t-rust" : "muted"}`} style={od ? { fontWeight: 600 } : undefined}>{od}</td>
                <td className="r num">{mine.length - od}</td>
                <td className="r num">{open}</td>
                <td className="r num t-moss">{doneBy.get(u.id) || 0}</td>
                <td className="r num">{mins(loggedBy.get(u.id) || 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <div className="split" style={{ ["--aside" as string]: "340px" }}>
        <section className="stack"><h2>Today across the team</h2>
          {attention.length ? attention.map(([u, mine]) => (
            <details key={u.id} className="panel" open={u.id === cur.id}>
              <summary><span className="person"><Av name={u.name} size={24} />{u.name}{ctx.onLeaveToday.has(u.id) ? <> <span className="chip chip-leave">On leave</span></> : null}</span> <span className="small muted" style={{ fontFamily: "var(--f-body)", fontWeight: 400 }}>{mine.length} {mine.length === 1 ? "task needs" : "tasks need"} attention</span></summary>
              <ul className="lines">{mine.map((t) => <TaskLine key={t.id} t={t} lc={lc} />)}</ul>
            </details>
          )) : <p className="small muted">Everyone is clear for today.</p>}
        </section>
        <section className="stack">
          <div className="between" style={{ alignItems: "center" }}><h2>Recent activity</h2><Link className="link small" href="/activity">Open activity log</Link></div>
          <ol className="panel pad feed" data-clamp="list">
            {feed.length ? feed.map((a) => {
              const who = a.userId ? ctx.user(a.userId) : undefined;
              return (
                <li key={a.id}>
                  {who ? <Link className="link plink-b" href={`/people/${who.id}`}>{who.name}</Link> : <b>System</b>} {a.action}
                  {a.task ? <> on <Link className="link" href={`/tasks/${a.task.id}`}>{a.task.title}</Link></> : a.project ? <> in <Link className="link" href={`/projects/${a.project.id}`}>{a.project.name}</Link></> : null}
                  {a.detail && !["created task", "completed task", "reopened task"].includes(a.action) ? <span className="soft">: {a.detail}</span> : null}
                  <time>{fmtStamp(stampOf(a.createdAt))}</time>
                </li>
              );
            }) : <li className="muted">No activity yet.</li>}
          </ol>
        </section>
      </div>
    </>
  );
}
