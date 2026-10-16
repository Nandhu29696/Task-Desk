import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { HTYPE, LSTATUS, LTYPE, OPEN } from "@/lib/constants";
import { addK, addMonths, dowK, fmtMonth, fmtShort, startOfWeek } from "@/lib/dates";
import { anyHolidayOn, isWeekend, isWorking, offLabel } from "@/lib/calendar";
import { isAdmin } from "@/lib/permissions";
import { loadLeaves, type Cal } from "@/lib/model";
import { addHoliday, removeHoliday, saveWeekOff } from "@/app/actions/office";
import { ActionForm } from "@/components/client/ActionForm";
import { ConfirmButton } from "@/components/client/Widgets";
import { Options, Person } from "@/components/ui";
import { SATRULE } from "@/components/office/shared";

type Hol = Cal["holidays"][number];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const u = ctx.me, adm = isAdmin(u), cal = ctx.cal, t0 = ctx.today;
  const m = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : t0.slice(0, 7);
  const first = m + "-01", next = addMonths(first, 1), gridStart = startOfWeek(first);
  const cells: string[] = [];
  for (let k = gridStart; k < next || dowK(k) !== 1; k = addK(k, 1)) cells.push(k);
  const gridEnd = cells[cells.length - 1];
  const yr = m.slice(0, 4);
  const yearHol = cal.holidays.filter((h) => h.date.startsWith(yr)).sort((a, b) => (a.date < b.date ? -1 : 1));

  const [leaves, dues] = await Promise.all([
    loadLeaves({ status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: gridEnd }, toDate: { gte: gridStart } }),
    prisma.task.groupBy({ by: ["dueDate"], where: { status: { in: OPEN }, dueDate: { gte: gridStart, lte: gridEnd }, ...(adm ? {} : { assigneeId: u.id }) }, _count: { _all: true } }),
  ]);
  const dueOn = new Map(dues.map((d) => [d.dueDate, d._count._all]));
  const leavesIn = (k: string) => leaves.filter((l) => l.from <= k && l.to >= k && isWorking(cal, k));
  const monthLeaves = leaves.filter((l) => l.from < next && l.to >= first).sort((a, b) => (a.from < b.from ? -1 : 1));
  const prev = addMonths(first, -1).slice(0, 7), nxt = next.slice(0, 7);

  const row = (h: Hol) => (
    <tr key={h.id}>
      <td className="num small holiday-date">{fmtShort(h.date)}</td><td className="holiday-name">{h.name}</td>
      <td className="small holiday-type"><span className={`chip ${h.type === "RESTRICTED" ? "chip-rh" : "chip-hol"}`}>{HTYPE[h.type]}</span></td>
      {adm ? <td className="r holiday-action"><ActionForm action={removeHoliday} style={{ display: "inline" }}><input type="hidden" name="id" value={h.id} /><ConfirmButton label="Remove" className="btn btn-q btn-sm" /></ActionForm></td> : null}
    </tr>
  );
  const up = yearHol.filter((h) => h.date >= t0), past = yearHol.filter((h) => h.date < t0);

  return (
    <>
      <header className="between">
        <div><h1>Calendar</h1><p className="soft">Holidays and team leave. Public and company holidays skip daily routines and move other recurring tasks to the next working day.</p></div>
        <div className="row"><Link className="btn btn-q btn-sm" href={`/calendar?month=${prev}`}>Previous</Link><b style={{ minWidth: 130, textAlign: "center" }}>{fmtMonth(first)}</b><Link className="btn btn-q btn-sm" href={`/calendar?month=${nxt}`}>Next</Link></div>
      </header>
      <div className="row small"><span className="chip chip-hol">Public holiday</span><span className="chip chip-rh">Restricted holiday</span><span className="chip chip-leave">Approved leave</span><span className="chip chip-pend">Pending leave</span><span className="muted">Weekly off: {offLabel(cal.settings)}</span></div>
      <div className="cal" role="grid" aria-label={fmtMonth(first)}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="h">{d}</div>)}
        {cells.map((k) => {
          const hs = anyHolidayOn(cal, k), lv = leavesIn(k), n = dueOn.get(k) || 0;
          return (
            <div key={k} className={`d ${k.slice(0, 7) !== m ? "out" : ""} ${isWeekend(cal, k) ? "we" : ""} ${k === t0 ? "today" : ""}`}>
              <span className="n">{+k.slice(8, 10)}</span>
              {hs.map((h, i) => <span key={"h" + i} className={`chip ${h.type === "RESTRICTED" ? "chip-rh" : "chip-hol"}`} title={`${h.name}, ${HTYPE[h.type]}`}>{h.name}</span>)}
              {lv.map((l) => { const p = ctx.user(l.userId); return <span key={l.id} className={`chip ${l.status === "APPROVED" ? "chip-leave" : "chip-pend"}`} title={`${p?.name || ""}, ${LTYPE[l.type]}${l.status === "PENDING" ? ", pending" : ""}`}>{p?.name.split(" ")[0]}{l.half ? " ½" : ""}</span>; })}
              {n ? <span className="xs muted num" title={adm ? "Open tasks due across the team" : "Your open tasks due"}>{n} due</span> : null}
            </div>
          );
        })}
      </div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <section className="panel pad stack"><h2>Leave this month</h2>
          {monthLeaves.length ? <ul className="feed">{monthLeaves.map((l) => (
            <li key={l.id} className="between" style={{ alignItems: "center" }}>
              <span><Person u={ctx.user(l.userId)} size={22} /> <span className="soft small">{LTYPE[l.type]}, {l.from === l.to ? fmtShort(l.from) : `${fmtShort(l.from)} to ${fmtShort(l.to)}`}{l.half ? ", half day" : ""}</span></span>
              <span className={`chip lv-${l.status}`}>{LSTATUS[l.status]}</span>
            </li>
          ))}</ul> : <p className="small muted">No leave this month.</p>}
        </section>
        <section className="panel pad stack"><h2>Holidays in {yr}</h2><p className="xs muted" style={{ marginTop: -6 }}>Upcoming first</p>
          {up.length ? <div className="tablebox holiday-tablebox"><table className="t holiday-table"><tbody>{up.map(row)}</tbody></table></div> : <p className="small muted">No more holidays this year.</p>}
          {past.length ? <details><summary className="sumlink">Earlier in {yr} ({past.length})</summary><div className="tablebox holiday-tablebox"><table className="t holiday-table"><tbody>{past.map(row)}</tbody></table></div></details> : null}
          {adm ? (
            <>
              <ActionForm action={addHoliday} reset className="stack" style={{ borderTop: "1px solid var(--line2)", paddingTop: 12 }}>
                <h3>Add a holiday</h3>
                <div className="grid4" style={{ gridTemplateColumns: "1fr 1.6fr 1.2fr auto", alignItems: "end" }}>
                  <div><label className="lbl" htmlFor="h-d">Date</label><input className="field" id="h-d" type="date" name="date" required /></div>
                  <div><label className="lbl" htmlFor="h-n">Name</label><input className="field" id="h-n" name="name" required placeholder="Office foundation day" /></div>
                  <div><label className="lbl" htmlFor="h-t">Type</label><select className="field" id="h-t" name="type" defaultValue="PUBLIC"><Options opts={Object.entries(HTYPE)} /></select></div>
                  <button className="btn btn-p">Add</button>
                </div>
              </ActionForm>
              <ActionForm action={saveWeekOff} className="stack" style={{ borderTop: "1px solid var(--line2)", paddingTop: 12 }}>
                <h3>Weekly off</h3>
                <div className="row"><label className="check"><input type="checkbox" name="sun" defaultChecked={cal.settings.sundayOff !== false} />Sundays off</label><select className="fsm" name="sat" aria-label="Saturdays" defaultValue={cal.settings.satRule}><Options opts={Object.entries(SATRULE)} /></select><button className="btn btn-q btn-sm">Save</button></div>
                <p className="xs muted">Recurring tasks, leave days and attendance follow this.</p>
              </ActionForm>
            </>
          ) : <p className="xs muted">The admin manages the holiday list.</p>}
          <p className="xs muted">Public holidays apply to everyone and move recurring tasks. Restricted holidays are personal: each person can take up to {cal.settings.rhLimit} from the Leave page. Islamic festival dates depend on moon sighting.</p>
        </section>
      </div>
    </>
  );
}
