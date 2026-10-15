"use client";
// Port of the preview's vNewProject form, with the npclient (fill contact from client), npline (tick that line's templates)
// and addrow / rmrow behaviours.
import Link from "next/link";
import { useRef, useState } from "react";
import { FREQ, FREQS, INDUSTRIES, LINE, LINES, WD } from "@/lib/constants";
import { createProject } from "@/app/actions/projects";
import { ActionForm } from "../client/ActionForm";
import { Options } from "../ui";
import { TplPicker } from "./TplPicker";
import { CommsBoxes } from "./CommsBoxes";

export type ClientOpt = { id: string; name: string; industry: string; poc: { name: string; role: string; phone: string; email: string }; comms: string[] };

function RecRow({ people, onRemove }: { people: [string, string][]; onRemove: (row: HTMLDivElement) => void }) {
  const [f, setF] = useState("WEEKLY");
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="rrow" ref={ref}>
      <div><label className="lbl">Task</label><input className="field" name="rr_title" placeholder="Check lead form submissions" /></div>
      <div><label className="lbl">Repeats</label><select className="field" name="rr_freq" value={f} onChange={(e) => setF(e.currentTarget.value)}><Options opts={FREQS.filter((x) => x !== "ONCE").map((x) => [x, FREQ[x]])} /></select></div>
      <div>
        <div hidden={f !== "DAILY"}><label className="lbl">Days</label><p className="field" style={{ background: "var(--raised)", color: "var(--ink2)" }}>Working days</p></div>
        <div hidden={f !== "WEEKLY"}><label className="lbl">On</label><select className="field" name="rr_weekday" defaultValue="1"><Options opts={WD.map((d, i) => [i, d])} /></select></div>
        <div hidden={f !== "MONTHLY" && f !== "QUARTERLY"}><label className="lbl">Day of month</label><input className="field" type="number" min={1} max={31} name="rr_monthday" defaultValue={1} /></div>
      </div>
      <div><label className="lbl">Assignee</label><select className="field" name="rr_assignee" defaultValue=""><Options opts={[["", "Project lead"], ...people]} /></select></div>
      <button type="button" className="x" aria-label="Remove row" title="Remove" style={{ paddingBottom: 10 }} onClick={() => ref.current && onRemove(ref.current)}>&times;</button>
    </div>
  );
}

export function NewProjectForm({ admin, clients, presetClient, leads, people, team, meId, today }: {
  admin: boolean; clients: ClientOpt[]; presetClient: string; leads: [string, string][]; people: [string, string][]; team: [string, string][]; meId: string; today: string;
}) {
  const [line, setLine] = useState("SEO");
  const [clientId, setClientId] = useState(presetClient);
  const [label, setLabel] = useState("");
  const hasClient = !!clientId || !!label.trim(); // the contact is only needed for client work
  const [rows, setRows] = useState([1]);
  const next = useRef(2);
  const preset = clients.find((c) => c.id === presetClient);
  const pc = preset?.poc || { name: "", role: "", phone: "", email: "" };

  const pickClient = (el: HTMLSelectElement) => {
    const id = el.value;
    setClientId(id);
    const c = clients.find((x) => x.id === id); const f = el.form;
    if (!c || !f) return;
    const set = (n: string, v: string) => { const el = f.elements.namedItem(n); if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = v; };
    set("poc_name", c.poc.name); set("poc_role", c.poc.role); set("poc_phone", c.poc.phone); set("poc_email", c.poc.email);
    f.querySelectorAll<HTMLInputElement>('input[name="comms"]').forEach((x) => (x.checked = c.comms.includes(x.value)));
    if (c.industry) set("industry", c.industry);
  };
  const removeRow = (key: number) => (row: HTMLDivElement) => {
    if (rows.length > 1) setRows(rows.filter((k) => k !== key));
    else row.querySelectorAll("input").forEach((i) => (i.value = ""));
  };

  return (
    <ActionForm action={createProject} className="stack-lg" style={{ maxWidth: 860 }}>
      <section className="panel pad stack"><h2>Project</h2>
        <div className="grid2">
          <div><label className="lbl" htmlFor="np-name">Project name</label><input className="field" id="np-name" name="name" required placeholder="Coimbatore Realty PPC" /></div>
          {admin ? (
            <div><label className="lbl" htmlFor="np-client">Client</label><select className="field" id="np-client" name="clientId" value={clientId} onChange={(e) => pickClient(e.currentTarget)}><Options opts={[["", "Internal (no client)"], ...clients.map((c): [string, string] => [c.id, c.name])]} /></select></div>
          ) : (
            <div><label className="lbl" htmlFor="np-clientl">Client</label><input className="field" id="np-clientl" name="clientLabel" placeholder="Leave empty for internal work" value={label} onChange={(e) => setLabel(e.currentTarget.value)} /></div>
          )}
          {admin && !clientId ? <div><label className="lbl" htmlFor="np-clientl">Client name if not in the list</label><input className="field" id="np-clientl" name="clientLabel" placeholder="Leave empty for internal work" value={label} onChange={(e) => setLabel(e.currentTarget.value)} /></div> : null}
          <div><label className="lbl" htmlFor="np-ind">Industry</label><select className="field" id="np-ind" name="industry" defaultValue={preset?.industry || "Real estate"}><Options opts={INDUSTRIES.map((i) => [i, i])} /></select></div>
          <div><label className="lbl" htmlFor="np-web">Website</label><input className="field" id="np-web" name="website" type="url" placeholder="https://example.in" /></div>
          <div><label className="lbl" htmlFor="np-line">Main service line</label><select className="field" id="np-line" name="line" value={line} onChange={(e) => setLine(e.currentTarget.value)}><Options opts={LINES.map((x) => [x, LINE[x]])} /></select></div>
          {admin ? <div><label className="lbl" htmlFor="np-lead">Project lead</label><select className="field" id="np-lead" name="leadId" defaultValue={meId}><Options opts={leads} /></select></div> : null}
          <div><label className="lbl" htmlFor="np-start">Start date</label><input className="field" id="np-start" type="date" name="startDate" defaultValue={today} /></div>
        </div>
        <div><label className="lbl" htmlFor="np-desc">Scope and notes</label><textarea className="field" id="np-desc" name="description" rows={3} placeholder="Retainer scope, KPIs, where access details are kept" /></div>
      </section>
      <section className="panel pad stack">
        <div><h2>Client contact</h2><p className="small soft">Who the team talks to for this project.{admin ? " Filled in from the client when you pick one." : ""}</p></div>
        <div className="grid4">
          <div><label className="lbl" htmlFor="np-pn">Name{hasClient ? "" : " (optional for internal work)"}</label><input className="field" id="np-pn" name="poc_name" required={hasClient} defaultValue={pc.name} /></div>
          <div><label className="lbl" htmlFor="np-pr">Position</label><input className="field" id="np-pr" name="poc_role" defaultValue={pc.role} placeholder="Marketing Manager" /></div>
          <div><label className="lbl" htmlFor="np-pp">Phone</label><input className="field" id="np-pp" name="poc_phone" defaultValue={pc.phone} placeholder="+91 98765 43210" /></div>
          <div><label className="lbl" htmlFor="np-pe">Email</label><input className="field" id="np-pe" type="email" name="poc_email" defaultValue={pc.email} /></div>
        </div>
        <div><span className="lbl">Preferred way to communicate</span><CommsBoxes name="comms" selected={preset?.comms || []} /></div>
      </section>
      <section className="panel pad stack"><h2>Team</h2>
        <div className="checks">{team.map(([id, name]) => <label key={id} className="check"><input type="checkbox" name="m" value={id} defaultChecked={id === meId} />{name}</label>)}</div>
      </section>
      <section className="panel pad stack">
        <div><h2>Recurring work from templates</h2><p className="small soft">Templates for the main service line are ticked. Change days, people and estimates on the project page later.</p></div>
        <div style={{ maxWidth: 320 }}><label className="lbl" htmlFor="np-as">Assign template tasks to</label><select className="field" id="np-as" name="tplAssignee" defaultValue=""><Options opts={[["", "Project lead"], ...people]} /></select></div>
        <TplPicker key={line} openLine={line} />
      </section>
      <section className="panel pad stack">
        <div><h2>Your own recurring tasks</h2><p className="small soft">Add routines specific to this client. Leave a row empty to skip it.</p></div>
        <div className="rowlist" id="recrows">{rows.map((k) => <RecRow key={k} people={people} onRemove={removeRow(k)} />)}</div>
        <div><button type="button" className="btn btn-q btn-sm" onClick={() => setRows([...rows, next.current++])}>Add another recurring task</button></div>
      </section>
      <div className="row"><button className="btn btn-p">Create project</button><Link className="btn btn-q" href="/projects">Cancel</Link></div>
    </ActionForm>
  );
}
