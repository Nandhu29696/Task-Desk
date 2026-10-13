import { COMMS } from "@/lib/constants";

/** Port of the preview's commsBoxes(). */
export function CommsBoxes({ name, selected }: { name: string; selected: string[] }) {
  return (
    <div className="row" style={{ gap: "6px 16px" }}>
      {Object.entries(COMMS).map(([k, l]) => <label key={k} className="check"><input type="checkbox" name={name} value={k} defaultChecked={selected.includes(k)} />{l}</label>)}
    </div>
  );
}
