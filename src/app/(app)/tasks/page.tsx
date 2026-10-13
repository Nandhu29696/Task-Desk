import Link from "next/link";
import Form from "next/form";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { BOARD_COLS, FREQ, FREQS, OPEN, STATUS, STATUSES, closed } from "@/lib/constants";
import { addK, fromLocal } from "@/lib/dates";
import { canEdit } from "@/lib/permissions";
import { blockerCount, sortTasks } from "@/lib/logic";
import { loadProjects, loadTasks, type T } from "@/lib/model";
import { setTaskStatus } from "@/app/actions/taskStatus";
import { setTaskView } from "@/app/actions/tasks";
import { ActionForm, AutoCheck, AutoSubmit } from "@/components/client/ActionForm";
import { Icon } from "@/components/Icon";
import { Av, Cad, Due, Empty, Options, Person, Pri } from "@/components/ui";
import { StatusCtl, Tick, lineCtx, type LineCtx } from "@/components/tasklines";
import { Board } from "@/components/tasks/Board";

type SP = Record<string, string | undefined>;

function BoardCard({ t, lc, edit, comments }: { t: T; lc: LineCtx; edit: boolean; comments: number }) {
  const shut = closed(t.status), sd = t.subtasks.filter((x) => x.done).length, bl = !shut && blockerCount(t, lc.statusOf);
  const p = lc.project(t.projectId), a = lc.user(t.assigneeId);
  return (
    <article className={`kcard kp-${t.priority} ${shut ? "kdone" : ""}`} {...(edit ? { draggable: true, "data-drag": t.id, "data-status": t.status } : {})}>
      <Link className="kt" href={`/tasks/${t.id}`}>{t.title}</Link>
      <div className="kmeta">{p ? <span className="xs soft tclip">{p.name}</span> : <span className="xs muted">No project</span>}</div>
      <div className="kchips"><Cad f={t.frequency} /><Due k={t.dueDate} today={lc.today} done={shut} />{bl ? <span className="chip chip-dep">Waiting</span> : null}</div>
      <div className="kfoot">
        <span className="kinfo xs muted"><Pri p={t.priority} />{t.subtasks.length ? <span title="Subtasks"><Icon name="tasks" />{sd}/{t.subtasks.length}</span> : null}{comments ? <span title="Comments"><Icon name="at" />{comments}</span> : null}</span>
        {t.assigneeId ? <span title={a?.name || ""}><Av name={a?.name || "?"} size={24} /></span> : <span className="xs muted">Unassigned</span>}
      </div>
      {edit ? (
        <ActionForm action={setTaskStatus} key={t.status} style={{ display: "contents" }}>
          <input type="hidden" name="id" value={t.id} />
          <AutoSubmit className="fsm kmove" name="status" defaultValue="" aria-label={`Move ${t.title}`}>
            <option value="">Move to</option>
            {STATUSES.filter((x) => x !== t.status).map((x) => <option key={x} value={x}>{STATUS[x]}</option>)}
          </AutoSubmit>
        </ActionForm>
      ) : null}
    </article>
  );
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { me, today } = ctx;

  let view = "BOARD";
  try { const map = JSON.parse((await cookies()).get("td_tview")?.value || "{}") as Record<string, string>; if (map[me.id] === "LIST") view = "LIST"; } catch { /* default */ }

  const f = {
    q: (sp.q || "").trim(),
    assignee: sp.assignee || "me",
    project: sp.project || "",
    status: sp.status && (sp.status === "open" || sp.status === "all" || STATUS[sp.status]) ? sp.status : "open",
    cadence: sp.cadence && FREQ[sp.cadence] ? sp.cadence : "",
    overdue: !!sp.overdue,
  };
  const recentFrom = addK(today, -14);

  const and: Prisma.TaskWhereInput[] = [];
  if (f.assignee === "me") and.push({ OR: [{ assigneeId: me.id }, { collaborators: { some: { userId: me.id } } }] });
  else if (f.assignee === "none") and.push({ assigneeId: null });
  else if (f.assignee !== "all") and.push({ assigneeId: f.assignee });
  if (f.status === "open") and.push(view === "BOARD" ? { OR: [{ status: { in: OPEN } }, { status: "DONE", completedAt: { gte: fromLocal(recentFrom) } }] } : { status: { in: OPEN } });
  else if (f.status !== "all") and.push({ status: f.status });
  if (f.cadence) and.push({ frequency: f.cadence });
  if (f.project) and.push({ projectId: f.project });
  if (f.overdue) and.push({ status: { notIn: ["DONE", "CANCELLED"] }, dueDate: { lt: today, not: null } });

  const [all, projects, statusRows] = await Promise.all([
    loadTasks({ AND: and }),
    loadProjects(),
    prisma.task.findMany({ select: { id: true, status: true } }),
  ]);
  const q = f.q.toLowerCase();
  let arr = q ? all.filter((t) => (t.title + " " + t.description + " " + t.subtasks.map((s) => s.title).join(" ")).toLowerCase().includes(q)) : all;
  arr = sortTasks(arr);

  const cols = ["open", "all"].includes(f.status) ? BOARD_COLS.concat(f.status === "all" ? ["CANCELLED"] : []) : [f.status];
  const total = arr.length;
  const shown = view === "BOARD" ? arr.filter((t) => cols.includes(t.status)) : arr.slice(0, 300);
  const cRows = shown.length ? await prisma.comment.groupBy({ by: ["taskId"], where: { taskId: { in: shown.map((t) => t.id) } }, _count: { _all: true } }) : [];
  const comments = new Map(cRows.map((c) => [c.taskId, c._count._all]));
  const lc = lineCtx(ctx, projects, statusRows, comments);

  const toggle = (
    <ActionForm action={setTaskView} quiet className="seg seg-sm" role="tablist" aria-label="View">
      {([["BOARD", "Board"], ["LIST", "List"]] as const).map(([k, l]) => <button key={k} type="submit" role="tab" name="v" value={k} aria-pressed={view === k}>{l}</button>)}
    </ActionForm>
  );

  let body: React.ReactNode;
  if (view === "BOARD") {
    const inCol = (st: string) => shown.filter((t) => t.status === st && ((st !== "DONE" && st !== "CANCELLED") || f.status !== "open" || ((t.completedAt || t.cancelledAt || "").slice(0, 10) >= recentFrom)));
    const doneSort = (a: T[]) => [...a].sort((x, y) => ((x.completedAt || x.cancelledAt || "") < (y.completedAt || y.cancelledAt || "") ? 1 : -1));
    body = (
      <>
        <p className="small muted">{shown.length} tasks on the board</p>
        <Board cols={cols.length}>
          {cols.map((st) => {
            const items = closed(st) ? doneSort(inCol(st)) : inCol(st);
            return (
              <section key={st} className={`kcol kc-${st}`} data-drop={st}>
                <header className="khead"><span className="kdot" /><b>{STATUS[st]}</b><span className="kcount num">{items.length}</span></header>
                {st === "DONE" && f.status === "open" ? <p className="xs muted khint">Done in the last 14 days</p> : null}
                <div className="kbody" data-clamp="list">
                  {items.slice(0, 200).map((t) => <BoardCard key={t.id} t={t} lc={lc} edit={canEdit(me, t, lc.project(t.projectId))} comments={comments.get(t.id) || 0} />)}
                </div>
                {items.length ? null : <p className="kempty xs muted">Nothing here</p>}
              </section>
            );
          })}
        </Board>
      </>
    );
  } else {
    body = (
      <>
        <p className="small muted">{total} {total === 1 ? "task" : "tasks"}{total > 300 ? ", showing the first 300" : ""}</p>
        {shown.length ? (
          <div className="panel tablebox">
            <table className="t" style={{ minWidth: 880 }}>
              <thead><tr><th style={{ width: 36 }} /><th>Task</th><th>Assignee</th><th>Cadence</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map((t) => {
                  const shut = closed(t.status);
                  return (
                    <tr key={t.id}>
                      <td><Tick t={t} lc={lc} /></td>
                      <td style={{ maxWidth: 340 }}>
                        <Link className={`tl-title ${shut ? "done" : ""}`} href={`/tasks/${t.id}`}>{t.title}</Link>
                        <div className="small muted">{lc.project(t.projectId)?.name || "No project"}{t.subtasks.length ? `, ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} subtasks` : ""}</div>
                      </td>
                      <td><Person u={lc.user(t.assigneeId)} size={22} onLeave={!!t.assigneeId && ctx.onLeaveToday.has(t.assigneeId)} /></td>
                      <td><Cad f={t.frequency} /></td>
                      <td><Due k={t.dueDate} today={today} done={shut} /></td>
                      <td><Pri p={t.priority} /></td>
                      <td><StatusCtl t={t} lc={lc} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>No tasks match these filters. Try another person or status, or reset the filters.</Empty>}
      </>
    );
  }

  return (
    <>
      <header className="between">
        <div><h1>Tasks</h1><p className="soft">{view === "BOARD" ? "Drag a card to another column to change its status." : "Search and filter every task across projects and people."}</p></div>
        <div className="row" style={{ gap: 8 }}>{toggle}<Link className="btn btn-p" href="/tasks/new">New task</Link></div>
      </header>
      <Form action="/tasks" className="tfbar" key={JSON.stringify(f)}>
        <input className="field" id="f-q" name="q" defaultValue={f.q} placeholder="Search tasks, then press Enter" aria-label="Search tasks" />
        <AutoSubmit className="field" id="f-a" name="assignee" defaultValue={f.assignee} aria-label="Person">
          <Options opts={[["me", "My tasks"], ["all", "Everyone"], ["none", "Unassigned"], ...ctx.active.map((u) => [u.id, u.name] as [string, string])]} />
        </AutoSubmit>
        <AutoSubmit className="field" id="f-p" name="project" defaultValue={f.project} aria-label="Project">
          <Options opts={[["", "All projects"], ...projects.map((p) => [p.id, p.name] as [string, string])]} />
        </AutoSubmit>
        <AutoSubmit className="field" id="f-s" name="status" defaultValue={f.status} aria-label="Status">
          <Options opts={[["open", "Open"], ["all", "Any status"], ...STATUSES.map((x) => [x, STATUS[x]] as [string, string])]} />
        </AutoSubmit>
        <AutoSubmit className="field" id="f-c" name="cadence" defaultValue={f.cadence} aria-label="Cadence">
          <Options opts={[["", "All cadences"], ...FREQS.map((x) => [x, FREQ[x]] as [string, string])]} />
        </AutoSubmit>
        <label className="check"><AutoCheck name="overdue" value="1" defaultChecked={f.overdue} />Overdue only</label>
        <Link className="btn btn-q btn-sm" href="/tasks">Reset</Link>
      </Form>
      {body}
    </>
  );
}
