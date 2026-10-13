import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx, userOpts, type Ctx } from "@/lib/context";
import { LINE, LINES, PRIORITIES, PRIORITY, ROLE, STATUS, STATUSES, closed } from "@/lib/constants";
import { dueLabel, fmtDate, fmtShort, fmtStamp, mins } from "@/lib/dates";
import { canDelete, canEdit, canReassign, isAdmin } from "@/lib/permissions";
import { blockerCount, openDeps, sortTasks } from "@/lib/logic";
import { describeRule } from "@/lib/recurrence";
import { loadActivities, loadComments, loadRules, loadTask, loadTasks, loadTimeLogs, type T } from "@/lib/model";
import { setTaskStatus } from "@/app/actions/taskStatus";
import {
  addCollaborator, addComment, addDependency, addSubtask, assignSubtask, decideApproval, editTask, logTime,
  removeApproval, removeCollaborator, removeDependency, removeSubtask, requestApproval, toggleSubtask,
} from "@/app/actions/tasks";
import { ActionForm, AutoSubmit } from "@/components/client/ActionForm";
import { ConfirmButton, MentionPicker, Modal } from "@/components/client/Widgets";
import { CHECK, Icon } from "@/components/Icon";
import { Av, Cad, CommentText, Due, Empty, Options, Person, Pri, StPill } from "@/components/ui";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

function EditTask({ t, p, ctx, trigger, triggerClass, triggerLabel }: { t: T; p: { leadId: string | null } | undefined; ctx: Ctx; trigger: React.ReactNode; triggerClass: string; triggerLabel?: string }) {
  const { me } = ctx;
  return (
    <Modal title="Edit task" trigger={trigger} triggerClass={triggerClass} triggerLabel={triggerLabel}>
      <ActionForm action={editTask} className="stack">
        <input type="hidden" name="id" value={t.id} />
        <div><label className="lbl" htmlFor="e-title">Title</label><input className="field" id="e-title" name="title" defaultValue={t.title} required /></div>
        <div><label className="lbl" htmlFor="e-desc">Details</label><textarea className="field" id="e-desc" name="description" rows={4} defaultValue={t.description} /></div>
        <div className="grid2">
          {canReassign(me, t, p) ? <div><label className="lbl" htmlFor="e-as">Assignee</label><select className="field" id="e-as" name="assigneeId" defaultValue={t.assigneeId || ""}>{t.assigneeId ? null : <option value="">Unassigned</option>}<Options opts={ctx.active.map((u) => [u.id, u.name])} /></select></div> : null}
          <div><label className="lbl" htmlFor="e-due">Due date</label><input className="field" id="e-due" type="date" name="dueDate" defaultValue={t.dueDate || ""} /></div>
          <div><label className="lbl" htmlFor="e-pri">Priority</label><select className="field" id="e-pri" name="priority" defaultValue={t.priority}><Options opts={PRIORITIES.map((x) => [x, PRIORITY[x]])} /></select></div>
          <div><label className="lbl" htmlFor="e-cat">Service line</label><select className="field" id="e-cat" name="category" defaultValue={t.category}><Options opts={LINES.map((x) => [x, LINE[x]])} /></select></div>
          <div><label className="lbl" htmlFor="e-est">Estimate in minutes</label><input className="field" id="e-est" type="number" min={0} step={15} name="estimate" defaultValue={t.estimate || ""} /></div>
        </div>
        <div className="between"><div className="row"><button className="btn btn-p" name="intent" value="save">Save changes</button></div>{canDelete(me) ? <ConfirmButton label="Delete task" name="intent" value="delete" /> : null}</div>
        {!canDelete(me) ? <p className="xs muted">Only admins can delete tasks. Use Cancelled to close work that is no longer needed.</p> : null}
      </ActionForm>
    </Modal>
  );
}

const Hidden = ({ name = "id", value }: { name?: string; value: string }) => <input type="hidden" name={name} value={value} />;
const contents = { display: "contents" } as const;

export default async function TaskPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getCtx();
  const { me, today, user } = ctx;
  const t = await loadTask(id);
  if (!t) return <Empty>This task was deleted.</Empty>;

  const [project, rules, comments, logsAsc, hist, depTasks, blockingRows, depCandsAll] = await Promise.all([
    t.projectId ? prisma.project.findUnique({ where: { id: t.projectId }, select: { id: true, name: true, leadId: true, website: true } }) : Promise.resolve(null),
    t.ruleId ? loadRules({ id: t.ruleId }) : Promise.resolve([]),
    loadComments({ taskId: t.id }),
    loadTimeLogs({ taskId: t.id }),
    loadActivities({ taskId: t.id }, 25),
    t.deps.length ? prisma.task.findMany({ where: { id: { in: t.deps } }, select: { id: true, title: true, status: true } }) : Promise.resolve([]),
    prisma.taskDependency.findMany({ where: { dependsOnId: t.id }, select: { task: { select: { id: true, title: true } } } }),
    loadTasks({ id: { not: t.id, notIn: t.deps }, status: { notIn: ["DONE", "CANCELLED"] }, dependsOn: { none: { dependsOnId: t.id } }, ...(t.projectId ? { projectId: t.projectId } : { assigneeId: t.assigneeId }) }),
  ]);
  const p = project ? { leadId: project.leadId } : undefined;
  const r = rules[0];
  const edit = canEdit(me, t, p), shut = closed(t.status);
  const logs = logsAsc.slice().reverse();
  const cands = ctx.active.filter((x) => x.id !== t.assigneeId && !t.collab.includes(x.id));
  const sd = t.subtasks.filter((s) => s.done).length;
  const depMap = new Map(depTasks.map((d) => [d.id, d]));
  const deps = t.deps.map((d) => depMap.get(d)).filter((d): d is NonNullable<typeof d> => !!d);
  const statusOf = (x: string) => depMap.get(x)?.status;
  const blocking = blockingRows.map((b) => b.task);
  const depCands = sortTasks(depCandsAll).slice(0, 80);
  const subEdit = (s: { assigneeId: string | null }) => edit || s.assigneeId === me.id;
  const nextSt = STATUSES.filter((x) => x !== t.status);
  const depMode = sp.dep === "approval" ? "APPROVAL" : "TASK";
  const names = ctx.users.flatMap((x) => [x.name, x.name.split(" ")[0]]);
  const onLeave = (uid: string | null) => !!uid && ctx.onLeaveToday.has(uid);
  const bc = blockerCount(t, statusOf);

  return (
    <>
      <header className="thead">
        <div className="tcrumb small">
          {project ? <Link className="link" href={`/projects/${project.id}`}>{project.name}</Link> : <span className="muted">No project</span>}
          <Cad f={t.frequency} />
          {r ? <span className="muted">{describeRule(r)}</span> : null}
          {t.occ && t.occ !== t.dueDate ? <span className="chip chip-hol">Moved from {fmtShort(t.occ)} for a holiday</span> : null}
        </div>
        <div className="ttop">
          <h1 className="ttitle" style={shut ? { color: "var(--ink2)" } : undefined}>{t.title}</h1>
          {edit ? (
            <div className="tact">
              <label className="tstat"><StPill s={t.status} />
                <ActionForm action={setTaskStatus} key={t.status} style={contents}>
                  <Hidden value={t.id} />
                  <AutoSubmit className="fsm" name="status" defaultValue="" aria-label="Change status"><option value="">Move to</option><Options opts={nextSt.map((x) => [x, STATUS[x]])} /></AutoSubmit>
                </ActionForm>
              </label>
              {!shut ? (
                <ActionForm action={setTaskStatus} style={contents}><Hidden value={t.id} /><Hidden name="status" value="DONE" /><button className="btn btn-p btn-sm"><Icon name="check" /> Mark done</button></ActionForm>
              ) : null}
              <EditTask t={t} p={p} ctx={ctx} trigger={<Icon name="edit" />} triggerClass="iconbtn sm" triggerLabel="Edit task" />
            </div>
          ) : <div className="tact"><StPill s={t.status} /></div>}
        </div>
        <div className="tmeta small">
          <Person u={user(t.assigneeId)} size={22} onLeave={onLeave(t.assigneeId)} />
          <span>{t.dueDate ? <>Due <Due k={t.dueDate} today={today} done={shut} /></> : "No due date"}</span>
          <Pri p={t.priority} />
          <span className="soft">{mins(t.spent)} logged{t.estimate ? " of " + mins(t.estimate) : ""}</span>
          <span className="soft">{LINE[t.category] || ""}</span>
        </div>
      </header>

      {bc && !shut ? (
        <div className="banner warn"><span className="chip chip-dep">Waiting</span>
          <span>This task can be marked done after {[
            ...openDeps(t, statusOf).map((d) => <span key={d}><Link className="link" href={`/tasks/${d}`}>{depMap.get(d)?.title}</Link> is finished</span>),
            ...t.approvals.filter((a) => a.status === "PENDING").map((a) => <span key={a.id}>{user(a.userId)?.name} approves {a.note || "it"}</span>),
          ].flatMap((x, i) => (i ? [<span key={"s" + i}>, and </span>, x] : [x]))}.</span>
        </div>
      ) : null}

      <div className="tgrid">
        <div className="tmain">
          <section className="panel tcard">
            <div className="tsec">
              {t.description ? <p className="tdesc" data-clamp="text">{t.description}</p>
                : <p className="small muted">No details yet.{edit ? <> <EditTask t={t} p={p} ctx={ctx} trigger="Add details" triggerClass="link small" /></> : null}</p>}
              {project?.website ? <p className="xs">Site: <a href={project.website} target="_blank" rel="noreferrer">{project.website}</a></p> : null}
            </div>
            <div className="tsec">
              <div className="tsh"><h3>Subtasks</h3>{t.subtasks.length ? <span className="xs muted num">{sd} of {t.subtasks.length} done</span> : null}</div>
              {t.subtasks.length ? (
                <>
                  <div className="bar"><span style={{ width: `${Math.round((sd / t.subtasks.length) * 100)}%`, background: "var(--moss)" }} /></div>
                  <ul className="subs">
                    {t.subtasks.map((s) => (
                      <li key={s.id}>
                        {subEdit(s) ? (
                          <ActionForm action={toggleSubtask} style={contents}><Hidden value={s.id} /><button className={`tick ${s.done ? "on" : ""}`} aria-label={`${s.done ? "Reopen" : "Complete"} subtask: ${s.title}`}>{s.done ? CHECK : null}</button></ActionForm>
                        ) : <span className={`tick off ${s.done ? "on" : ""}`}>{s.done ? CHECK : null}</span>}
                        <span className={`stitle ${s.done ? "done" : ""}`}>{s.title}</span>
                        {edit ? (
                          <>
                            <ActionForm action={assignSubtask} key={s.assigneeId || ""} style={contents}><Hidden value={s.id} />
                              <AutoSubmit className="fsm" name="assigneeId" defaultValue={s.assigneeId || ""} aria-label="Subtask assignee"><Options opts={[["", "No one"], ...userOpts(ctx)]} /></AutoSubmit>
                            </ActionForm>
                            <ActionForm action={removeSubtask} style={contents}><Hidden value={s.id} /><button className="iconbtn sm" aria-label="Remove subtask" title="Remove"><Icon name="close" /></button></ActionForm>
                          </>
                        ) : s.assigneeId ? <Person u={user(s.assigneeId)} size={18} /> : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="xs muted">No subtasks yet.</p>}
              {edit ? (
                <ActionForm action={addSubtask} reset className="tdline"><Hidden value={t.id} />
                  <input className="fsm" name="title" required placeholder="Add a subtask" aria-label="Subtask title" />
                  <select className="fsm" name="assigneeId" aria-label="Subtask assignee" style={{ flex: "0 0 132px" }} defaultValue=""><Options opts={[["", "No one"], ...userOpts(ctx)]} /></select>
                  <button className="btn btn-q btn-sm">Add</button>
                </ActionForm>
              ) : null}
            </div>
          </section>

          <section className="panel tcard">
            <div className="tsec">
              <div className="tsh"><h3>Discussion</h3>{comments.length ? <span className="xs muted">{comments.length} {comments.length === 1 ? "comment" : "comments"}</span> : null}</div>
              {comments.length ? comments.map((c) => (
                <div className="comment" key={c.id}><Av name={user(c.userId)?.name || "?"} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div className="xs"><b className="small">{user(c.userId)?.name}</b> <span className="muted">{fmtStamp(c.at)}</span></div>
                    <p className="small" data-clamp="text"><CommentText body={c.body} names={names} /></p>
                  </div>
                </div>
              )) : <p className="xs muted">No comments yet. Share findings, blockers or links here.</p>}
              <ActionForm action={addComment} reset className="stack" style={{ gap: 6 }}><Hidden value={t.id} />
                <textarea className="field fcompact" id="c-body" name="body" rows={2} required placeholder="Write a comment. Type @ and a name to mention someone." aria-label="Comment" />
                <div className="row" style={{ gap: 6 }}><button className="btn btn-p btn-sm">Post</button><MentionPicker people={ctx.active.filter((x) => x.id !== me.id).map((x) => ({ id: x.id, name: x.name }))} /></div>
              </ActionForm>
            </div>
          </section>

          <details className="panel tcard thist">
            <summary><span>History</span><span className="xs muted">{hist.length} {hist.length === 1 ? "entry" : "entries"}</span></summary>
            <ol className="feed">
              {hist.length ? hist.map((a) => (
                <li key={a.id}><b>{user(a.userId)?.name || "System"}</b> {a.action}{a.detail && a.action !== "completed task" && a.action !== "created task" ? <span className="soft">: {a.detail}</span> : null}<time>{fmtStamp(a.at)}</time></li>
              )) : <li className="muted">Created automatically by a recurring task.</li>}
            </ol>
          </details>
        </div>

        <aside className="panel tside">
          <div className="tsec">
            <div className="tsh"><h3>Waiting on</h3></div>
            {deps.length || t.approvals.length ? (
              <>
                {deps.map((d) => (
                  <div className="deprow" key={d.id}><span className="dtype"><Icon name="tasks" /></span>
                    <span className="dmain"><Link className="link small" href={`/tasks/${d.id}`}>{d.title}</Link><StPill s={d.status} /></span>
                    {edit ? <ActionForm action={removeDependency} style={contents}><Hidden value={t.id} /><Hidden name="dep" value={d.id} /><button className="iconbtn sm" aria-label="Remove dependency" title="Remove"><Icon name="close" /></button></ActionForm> : null}
                  </div>
                ))}
                {t.approvals.map((a) => (
                  <div className="deprow" key={a.id}><span className="dtype"><Icon name="check" /></span>
                    <span className="dmain">
                      <span className="small">Approval from <b>{user(a.userId)?.name || "someone"}</b></span>
                      {a.note ? <span className="xs soft">{a.note}</span> : null}
                      <span className={`chip lv-${a.status}`}>{a.status === "PENDING" ? "Pending approval" : a.status === "APPROVED" ? "Approved" : "Rejected"}</span>
                      {a.status === "PENDING" && (a.userId === me.id || isAdmin(me)) ? (
                        <ActionForm action={decideApproval} className="row" style={{ gap: 6, marginTop: 4 }}><Hidden value={a.id} />
                          <button className="btn btn-p btn-sm" name="status" value="APPROVED">Approve</button>
                          <button className="btn btn-d btn-sm" name="status" value="REJECTED">Reject</button>
                        </ActionForm>
                      ) : null}
                    </span>
                    {edit ? <ActionForm action={removeApproval} style={contents}><Hidden value={a.id} /><button className="iconbtn sm" aria-label="Remove approval" title="Remove"><Icon name="close" /></button></ActionForm> : null}
                  </div>
                ))}
              </>
            ) : <p className="xs muted">Nothing. It can start any time.</p>}
            {edit && !shut ? (
              <>
                <div className="tdmode">
                  <Link className="link xs" href={`/tasks/${t.id}`} scroll={false} replace aria-pressed={depMode === "TASK"}>Link a task</Link>
                  <span className="muted xs">or</span>
                  <Link className="link xs" href={`/tasks/${t.id}?dep=approval`} scroll={false} replace aria-pressed={depMode === "APPROVAL"}>Ask for approval</Link>
                </div>
                {depMode === "TASK" ? (
                  depCands.length ? (
                    <ActionForm action={addDependency} className="tdline"><Hidden value={t.id} />
                      <select className="fsm" name="dep" aria-label="Task this one waits on"><Options opts={depCands.map((x) => [x.id, `${x.title} (${dueLabel(x.dueDate, today)})`])} /></select>
                      <button className="btn btn-q btn-sm">Add</button>
                    </ActionForm>
                  ) : <p className="xs muted">No other open tasks to link.</p>
                ) : (
                  <ActionForm action={requestApproval} reset className="stack" style={{ gap: 6 }}><Hidden value={t.id} />
                    <select className="fsm" name="userId" aria-label="Person who must approve"><Options opts={ctx.active.filter((x) => x.id !== me.id).map((x) => [x.id, `${x.name}, ${x.title || ROLE[x.role]}`])} /></select>
                    <div className="tdline"><input className="fsm" name="note" required placeholder="What needs approval" aria-label="What needs approval" /><button className="btn btn-q btn-sm">Ask</button></div>
                  </ActionForm>
                )}
              </>
            ) : null}
            {blocking.length ? (
              <>
                <p className="xs muted" style={{ marginTop: 4 }}>Waiting on this task</p>
                {blocking.map((x) => <Link key={x.id} className="link small tclip" href={`/tasks/${x.id}`}>{x.title}</Link>)}
              </>
            ) : null}
          </div>

          <div className="tsec">
            <div className="tsh"><h3>People</h3></div>
            <div className="between" style={{ alignItems: "center" }}><Person u={user(t.assigneeId)} size={22} onLeave={onLeave(t.assigneeId)} /><span className="xs muted">Assignee</span></div>
            {t.collab.map((cid) => (
              <div className="between" style={{ alignItems: "center" }} key={cid}><Person u={user(cid)} size={22} onLeave={onLeave(cid)} />
                {edit ? <ActionForm action={removeCollaborator} style={contents}><Hidden value={t.id} /><Hidden name="userId" value={cid} /><button className="iconbtn sm" title="Remove" aria-label="Remove collaborator"><Icon name="close" /></button></ActionForm> : null}
              </div>
            ))}
            {edit && cands.length ? (
              <ActionForm action={addCollaborator} reset className="tdline"><Hidden value={t.id} />
                <select className="fsm" name="userId" aria-label="Add collaborator" defaultValue=""><Options opts={[["", "Add a collaborator"], ...cands.map((x) => [x.id, x.name] as [string, string])]} /></select>
                <button className="btn btn-q btn-sm">Add</button>
              </ActionForm>
            ) : null}
          </div>

          {edit ? (
            <div className="tsec">
              <div className="tsh"><h3>Log time</h3>{logs.length ? <span className="xs muted num">{mins(t.spent)} total</span> : null}</div>
              <ActionForm action={logTime} reset className="stack" style={{ gap: 6 }}><Hidden value={t.id} />
                <div className="tlog">
                  <input className="fsm" name="hours" type="number" min={0} max={24} step={0.25} placeholder="Hours" aria-label="Hours" />
                  <input className="fsm" name="minutes" type="number" min={0} max={59} step={5} placeholder="Min" aria-label="Minutes" />
                  <input className="fsm" name="on" type="date" defaultValue={today} aria-label="Date" />
                </div>
                <div className="tdline"><input className="fsm" name="note" placeholder="Note (optional)" aria-label="Note" /><button className="btn btn-p btn-sm">Log</button></div>
              </ActionForm>
              {logs.length ? (
                <ul className="tlogs">{logs.slice(0, 4).map((l) => <li key={l.id}><span className="soft">{user(l.userId)?.name.split(" ")[0]}, {fmtShort(l.on)}{l.note ? ": " + l.note : ""}</span><b className="num">{mins(l.minutes)}</b></li>)}</ul>
              ) : null}
            </div>
          ) : null}

          <div className="tsec">
            <dl className="kv tkv">
              {([["Created", fmtDate(t.createdOn)], ["Created by", t.createdById ? user(t.createdById)?.name || "" : "Recurring task"], ...(t.completedAt ? [["Completed", fmtStamp(t.completedAt)]] : []), ...(t.cancelledAt ? [["Cancelled", fmtStamp(t.cancelledAt)]] : [])] as [string, string][]).map(([a, b]) => (
                <Fragment key={a}><dt>{a}</dt><dd>{b}</dd></Fragment>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
