import Link from "next/link";
import { getCtx, userOpts } from "@/lib/context";
import { LINE, LINES, PRIORITIES, PRIORITY } from "@/lib/constants";
import { isLeadOrAdmin } from "@/lib/permissions";
import { loadProjects } from "@/lib/model";
import { createTask } from "@/app/actions/tasks";
import { ActionForm } from "@/components/client/ActionForm";
import { Options } from "@/components/ui";
import { SubRows } from "@/components/tasks/SubRows";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { me, today } = ctx;
  const projects = await loadProjects({ status: "ACTIVE" });
  const pp = projects.find((p) => p.id === sp.project);
  const people = ctx.active.map((u) => [u.id, u.name] as [string, string]);
  return (
    <>
      <header className="stack" style={{ gap: 4 }}>
        <Link className="link small" href="/tasks" style={{ justifySelf: "start" }}>Back to tasks</Link>
        <h1>New task</h1>
        <p className="soft">Create one time work for yourself or a teammate. Repeating tasks are added from a project you lead.</p>
      </header>
      <ActionForm action={createTask} className="panel pad stack-lg" style={{ maxWidth: 780 }}>
        <div><label className="lbl" htmlFor="n-title">Task</label><input className="field" id="n-title" name="title" required placeholder="Migrate blog to new URL structure with 301 map" /></div>
        <div><label className="lbl" htmlFor="n-desc">Details</label><textarea className="field" id="n-desc" name="description" rows={3} placeholder="Links, acceptance criteria, client notes" /></div>
        <div className="grid2">
          <div><label className="lbl" htmlFor="n-proj">Project</label><select className="field" id="n-proj" name="projectId" defaultValue={pp?.id || ""}><Options opts={[["", "No project"], ...projects.map((p) => [p.id, p.name] as [string, string])]} /></select></div>
          <div><label className="lbl" htmlFor="n-cat">Service line</label><select className="field" id="n-cat" name="category" defaultValue={pp?.line || "GENERAL"}><Options opts={LINES.map((x) => [x, LINE[x]])} /></select></div>
          <div><label className="lbl" htmlFor="n-as">Assignee</label>
            {isLeadOrAdmin(me)
              ? <select className="field" id="n-as" name="assigneeId" defaultValue={me.id}><Options opts={userOpts(ctx)} /></select>
              : <><p className="field" style={{ background: "var(--bg)", color: "var(--ink2)" }}>{me.name} (me)</p><p className="xs muted" style={{ marginTop: 4 }}>Members create tasks for themselves. Add teammates as collaborators or give them subtasks.</p></>}
          </div>
          <div><label className="lbl" htmlFor="n-due">Due date</label><input className="field" id="n-due" type="date" name="dueDate" defaultValue={today} /></div>
          <div><label className="lbl" htmlFor="n-pri">Priority</label><select className="field" id="n-pri" name="priority" defaultValue="MEDIUM"><Options opts={PRIORITIES.map((x) => [x, PRIORITY[x]])} /></select></div>
          <div><label className="lbl" htmlFor="n-est">Estimate in minutes</label><input className="field" id="n-est" type="number" min={0} step={15} name="estimate" placeholder="60" /></div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack"><legend className="lbl">Subtasks</legend><SubRows people={people} /></fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="lbl">Collaborators</legend>
          <div className="checks">{ctx.active.filter((x) => x.id !== me.id).map((x) => <label key={x.id} className="check"><input type="checkbox" name="collab" value={x.id} />{x.name}</label>)}</div>
          <p className="xs muted" style={{ marginTop: 4 }}>Collaborators see this task on their My day page and can update it.</p>
        </fieldset>
        <div className="row"><button className="btn btn-p">Create task</button><Link className="btn btn-q" href="/tasks">Cancel</Link></div>
      </ActionForm>
    </>
  );
}
