"use client";

import { useState } from "react";

/** Subtask rows on the New task form (preview subRow with Add another subtask). */
export function SubRows({ people }: { people: [string, string][] }) {
  const [rows, setRows] = useState<number[]>([0, 1]);
  const [next, setNext] = useState(2);
  return (
    <>
      <div className="rowlist" id="subrows">
        {rows.map((k) => (
          <div className="srow" data-row key={k}>
            <input className="field" name="st_title" placeholder="Subtask" aria-label="Subtask title" />
            <select className="field" name="st_assignee" aria-label="Subtask assignee" defaultValue="">
              <option value="">No one</option>
              {people.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" className="x" aria-label="Remove row" title="Remove" onClick={() => setRows((r) => r.filter((x) => x !== k))}>&times;</button>
          </div>
        ))}
      </div>
      <div><button type="button" className="btn btn-q btn-sm" onClick={() => { setRows((r) => [...r, next]); setNext(next + 1); }}>Add another subtask</button></div>
    </>
  );
}
