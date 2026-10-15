"use client";
// Repeats picker on the New task form (preview vNewTask): "Does not repeat" or a cadence with its schedule fields.
import { useState } from "react";
import { FREQ, FREQS } from "@/lib/constants";
import { Options } from "../ui";
import { CadenceFields } from "../projects/RuleFields";

const ORDER = [...FREQS].sort((a, b) => (a === "ONCE" ? -1 : b === "ONCE" ? 1 : 0));

export function RepeatPicker({ enabled }: { enabled: boolean }) {
  const [f, setF] = useState("ONCE");
  return (
    <div className="stack">
      <div className="grid4">
        <div><label className="lbl" htmlFor="n-rep">Repeats</label>
          <select className="field" id="n-rep" name="frequency" value={f} onChange={(e) => setF(e.currentTarget.value)} disabled={!enabled}>
            <Options opts={ORDER.map((x): [string, string] => [x, x === "ONCE" ? "Does not repeat" : FREQ[x]])} />
          </select>
        </div>
        {f !== "ONCE" ? <CadenceFields f={f} /> : null}
      </div>
      <p className="xs muted">{enabled ? "Repeating tasks belong to a project you lead. They are created automatically up to a week ahead." : "Only project leads and admins can create repeating tasks. Ask your project lead to add one."}</p>
    </div>
  );
}
