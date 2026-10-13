// Task rows used on the dashboard, project page, profile and lists. Port of the preview's line(), tick() and statusCtl().
import Link from "next/link";
import { STATUS, STATUSES, closed } from "@/lib/constants";
import { canEdit } from "@/lib/permissions";
import { blockerCount } from "@/lib/logic";
import type { P, T, U } from "@/lib/model";
import { setTaskStatus, toggleTaskDone } from "@/app/actions/taskStatus";
import { ActionForm, AutoSubmit } from "./client/ActionForm";
import { CHECK } from "./Icon";
import { Cad, Due, Person, Pri, StPill } from "./ui";

export type LineCtx = {
  me: { id: string; role: string };
  today: string;
  user: (id: string | null | undefined) => U | undefined;
  project: (id: string | null | undefined) => P | undefined;
  statusOf: (id: string) => string | undefined;
  onLeave?: Set<string>;
  comments?: Map<string, number>;
};

export function Tick({ t, lc }: { t: T; lc: LineCtx }) {
  const done = t.status === "DONE";
  if (!canEdit(lc.me, t, lc.project(t.projectId))) return <span className={`tick off ${done ? "on" : ""}`} aria-hidden="true">{done ? CHECK : null}</span>;
  const label = closed(t.status) ? "Reopen" : "Mark done";
  return (
    <ActionForm action={toggleTaskDone} style={{ display: "contents" }}>
      <input type="hidden" name="id" value={t.id} />
      <button className={`tick ${done ? "on" : ""}`} aria-label={`${label}: ${t.title}`} title={label}>{done ? CHECK : null}</button>
    </ActionForm>
  );
}

export function StatusCtl({ t, lc }: { t: T; lc: LineCtx }) {
  if (!canEdit(lc.me, t, lc.project(t.projectId))) return <StPill s={t.status} />;
  return (
    <ActionForm action={setTaskStatus} key={t.status} style={{ display: "contents" }}>
      <input type="hidden" name="id" value={t.id} />
      <AutoSubmit className="fsm" name="status" defaultValue={t.status} aria-label="Status">{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}</AutoSubmit>
    </ActionForm>
  );
}

export function TaskLine({ t, lc, project = true, cadence = true, assignee = false }: { t: T; lc: LineCtx; project?: boolean; cadence?: boolean; assignee?: boolean }) {
  const shut = closed(t.status), p = lc.project(t.projectId), cc = lc.comments?.get(t.id) || 0;
  const collab = t.collab.map((id) => lc.user(id)?.name.split(" ")[0]).filter(Boolean);
  const sd = t.subtasks.filter((s) => s.done).length, bc = blockerCount(t, lc.statusOf);
  return (
    <li>
      <Tick t={t} lc={lc} />
      <div className="tl-main">
        <Link className={`tl-title ${shut ? "done" : ""}`} href={`/tasks/${t.id}`}>{t.title}</Link>
        <div className="tl-meta">
          {project && p ? <span>{p.name}</span> : null}
          {cadence ? <Cad f={t.frequency} /> : null}
          {assignee ? <Person u={lc.user(t.assigneeId)} size={18} onLeave={!!t.assigneeId && !!lc.onLeave?.has(t.assigneeId)} /> : null}
          {t.subtasks.length ? <span className="num">{sd}/{t.subtasks.length} subtasks</span> : null}
          {bc && !shut ? <span className="chip chip-dep">Waiting on {bc}</span> : null}
          {collab.length ? <span>with {collab.join(", ")}</span> : null}
          {cc ? <span>{cc} {cc === 1 ? "comment" : "comments"}</span> : null}
        </div>
      </div>
      <div className="tl-side"><Pri p={t.priority} /><Due k={t.dueDate} today={lc.today} done={shut} /><StatusCtl t={t} lc={lc} /></div>
    </li>
  );
}

/** A panel list of task rows. `clamp` shows 6 with Show all. */
export function TaskLines({ tasks, lc, clamp = false, ...o }: { tasks: T[]; lc: LineCtx; clamp?: boolean; project?: boolean; cadence?: boolean; assignee?: boolean }) {
  return <ul className="lines panel" data-clamp={clamp ? "list" : undefined}>{tasks.map((t) => <TaskLine key={t.id} t={t} lc={lc} {...o} />)}</ul>;
}

/** Compact row used in dashboard widgets and profile cards (preview miniLine). */
export function MiniLine({ t, lc, extra }: { t: T; lc: LineCtx; extra?: React.ReactNode }) {
  const shut = closed(t.status), p = lc.project(t.projectId);
  return (
    <li className="mini">
      <Tick t={t} lc={lc} />
      <div className="tl-main">
        <Link className={`tl-title ${shut ? "done" : ""}`} href={`/tasks/${t.id}`}>{t.title}</Link>
        <div className="tl-meta">{p ? <span>{p.name}</span> : null}<Cad f={t.frequency} /><Due k={t.dueDate} today={lc.today} done={shut} />{blockerCount(t, lc.statusOf) && !shut ? <span className="chip chip-dep">Waiting</span> : null}</div>
      </div>
      {extra}
    </li>
  );
}

/** Builds a LineCtx from loaded data. */
export function lineCtx(base: { me: { id: string; role: string }; today: string; user: LineCtx["user"]; onLeaveToday?: Set<string> }, projects: P[], statusTasks: { id: string; status: string }[], comments?: Map<string, number>): LineCtx {
  const pm = new Map(projects.map((p) => [p.id, p]));
  const sm = new Map(statusTasks.map((t) => [t.id, t.status]));
  return { me: base.me, today: base.today, user: base.user, project: (id) => (id ? pm.get(id) : undefined), statusOf: (id) => sm.get(id), onLeave: base.onLeaveToday, comments };
}
