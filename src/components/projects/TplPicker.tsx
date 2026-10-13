// Port of the preview's tplPicker(): templates grouped by service line, the open line ticked.
import { FORDER, LINE, TEMPLATES, TPL_LINES, WD } from "@/lib/constants";
import { mins } from "@/lib/dates";
import { Cad } from "../ui";

export function TplPicker({ openLine, exclude = [] }: { openLine: string | null; exclude?: string[] }) {
  return (
    <div className="tpl stack" style={{ gap: 8 }}>
      {TPL_LINES.map((ln) => {
        const items = TEMPLATES.filter((t) => t.line === ln && !exclude.includes(t.title)).sort((a, b) => FORDER[a.frequency] - FORDER[b.frequency]);
        if (!items.length) return null;
        return (
          <details key={ln} data-line={ln} open={ln === openLine}>
            <summary>{LINE[ln]} <span className="muted" style={{ fontWeight: 400 }}>({items.length} templates)</span></summary>
            <ul>
              {items.map((t) => {
                const when = t.frequency === "DAILY" ? "Every working day" : t.frequency === "WEEKLY" ? "Every " + WD[t.weekday ?? 1] : t.frequency === "MONTHLY" ? `Day ${t.monthDay} of each month` : t.frequency === "QUARTERLY" ? `Every 3 months, day ${t.monthDay}` : t.dueOffsetDays ? `${t.dueOffsetDays} days after start` : "On start date";
                return (
                  <li key={t.key}>
                    <label>
                      <input type="checkbox" name="tpl" value={t.key} data-line={t.line} defaultChecked={ln === openLine} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14 }}>{t.title}</span>
                        <span className="row xs muted" style={{ gap: 8, marginTop: 2 }}><Cad f={t.frequency} />{when}, about {mins(t.est)}{t.checklist.length ? `, ${t.checklist.length} subtasks` : ""}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
