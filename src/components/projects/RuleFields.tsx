"use client";
// Port of the preview's ruleFields() and cadenceFields(): the Repeats picker shows the matching schedule fields.
import { useState } from "react";
import { FREQ, FREQS, LINE, LINES, PRIORITIES, PRIORITY, WD } from "@/lib/constants";
import { Options } from "../ui";

export type RuleInit = { title: string; description: string; category: string; frequency: string; weekday: number | null; monthDay: number | null; skipWeekends: boolean; dueOffsetDays: number; startDate: string; endDate: string | null; assigneeId: string | null; priority: string; estimate: number | null; checklist: string[] };

export function CadenceFields({ f, r, prefix = "" }: { f: string; r?: Partial<RuleInit> | null; prefix?: string }) {
  return (
    <>
      <label className="check" style={{ paddingTop: 26 }} hidden={f !== "DAILY"}><input type="checkbox" name={`${prefix}skipWeekends`} defaultChecked={r ? !!r.skipWeekends : true} />Working days only</label>
      <div hidden={f !== "WEEKLY"}><label className="lbl">On</label><select className="field" name={`${prefix}weekday`} defaultValue={String(r?.weekday ?? 1)}><Options opts={WD.map((d, i) => [i, d])} /></select></div>
      <div hidden={f !== "MONTHLY" && f !== "QUARTERLY"}><label className="lbl">Day of month</label><input className="field" type="number" min={1} max={31} name={`${prefix}monthDay`} defaultValue={r?.monthDay ?? 1} /></div>
    </>
  );
}

export function RuleFields({ r, defLine, people, today }: { r?: RuleInit | null; defLine?: string; people: [string, string][]; today: string }) {
  const [f, setF] = useState(r?.frequency || "WEEKLY");
  return (
    <>
      <div><label className="lbl">Task title</label><input className="field" name="title" required defaultValue={r?.title || ""} placeholder="Check Search Console for crawl errors" /></div>
      <div className="grid4">
        <div><label className="lbl">Repeats</label><select className="field" name="frequency" value={f} onChange={(e) => setF(e.currentTarget.value)}><Options opts={FREQS.map((x) => [x, FREQ[x]])} /></select></div>
        <CadenceFields f={f} r={r} />
        <div hidden={f !== "ONCE"}><label className="lbl">Due days after start</label><input className="field" type="number" min={0} max={365} name="dueOffsetDays" defaultValue={r?.dueOffsetDays ?? 0} /></div>
      </div>
      <div className="grid4">
        <div style={{ gridColumn: "span 2" }}><label className="lbl">Assignee</label><select className="field" name="assigneeId" defaultValue={r?.assigneeId || ""}><Options opts={[["", "Project lead"], ...people]} /></select></div>
        <div><label className="lbl">Priority</label><select className="field" name="priority" defaultValue={r?.priority || "MEDIUM"}><Options opts={PRIORITIES.map((x) => [x, PRIORITY[x]])} /></select></div>
        <div><label className="lbl">Estimate (min)</label><input className="field" type="number" min={0} step={5} name="estimate" defaultValue={r?.estimate ?? ""} /></div>
        <div><label className="lbl">Starts</label><input className="field" type="date" name="startDate" defaultValue={r?.startDate || today} /></div>
        <div><label className="lbl">Ends (optional)</label><input className="field" type="date" name="endDate" defaultValue={r?.endDate || ""} /></div>
        <div style={{ gridColumn: "span 2" }}><label className="lbl">Service line</label><select className="field" name="category" defaultValue={r?.category || defLine || "GENERAL"}><Options opts={LINES.map((x) => [x, LINE[x]])} /></select></div>
      </div>
      <div className="grid2">
        <div><label className="lbl">Instructions</label><textarea className="field" name="description" rows={3} defaultValue={r?.description || ""} /></div>
        <div><label className="lbl">Subtasks, one per line</label><textarea className="field" name="checklist" rows={3} placeholder={"Pull the data\nWrite the summary\nSend to client"} defaultValue={(r?.checklist || []).join("\n")} /></div>
      </div>
    </>
  );
}
