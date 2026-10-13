import Form from "next/form";
import Link from "next/link";
import { getCtx, userOpts } from "@/lib/context";
import { LTYPE } from "@/lib/constants";
import { fmtMonth, fmtShort, fmtTime, mins } from "@/lib/dates";
import { holidayOn, isWorking } from "@/lib/calendar";
import { dayAttendance } from "@/lib/attendance";
import { loadLeaves, loadSessions } from "@/lib/model";
import { AutoSubmit } from "@/components/client/ActionForm";
import { Options, Person } from "@/components/ui";
import { attScope, dailyRows, loadAttendance } from "@/components/office/attendance";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const t0 = ctx.today, cal = ctx.cal;
  const { team, months, month, personId } = attScope(ctx.me, ctx.users, t0, sp);
  const [d, todaySess, todayLeave] = await Promise.all([
    loadAttendance(cal, ctx.users, month, personId, t0, ctx.now),
    team ? loadSessions({ day: t0 }) : Promise.resolve([]),
    team ? loadLeaves({ status: "APPROVED", fromDate: { lte: t0 }, toDate: { gte: t0 } }) : Promise.resolve([]),
  ]);
  const working = isWorking(cal, t0), hol = holidayOn(cal, t0);
  const detailFor = personId ? ctx.user(personId) : undefined;
  const csv = `/api/attendance/csv?month=${month}${team && personId ? `&person=${personId}` : ""}`;
  const personHref = (id: string) => `/attendance?month=${month}&person=${id}`;

  return (
    <>
      <header><h1>Attendance</h1><p className="soft">Sign in and sign out times are recorded automatically when people sign in and out of TaskDesk.</p></header>
      {team ? (
        <section className="stack"><h2>Today, {fmtShort(t0)}</h2>
          {!working ? <p className="small muted">{hol ? hol.name : "Weekly off"}. No one is expected in today.</p> : null}
          <div className="panel tablebox"><table className="t" style={{ minWidth: 640 }}>
            <thead><tr><th>Person</th><th>Signed in</th><th>Signed out</th><th className="r">Time so far</th><th>Status</th></tr></thead>
            <tbody>
              {ctx.active.map((x) => {
                const a = dayAttendance(todaySess, x.id, t0, t0, ctx.now), lv = todayLeave.find((l) => l.userId === x.id);
                return (
                  <tr key={x.id}>
                    <td><Person u={x} /></td>
                    <td className="num small">{a ? fmtTime(a.first) : ""}</td>
                    <td className="num small">{a ? (a.last ? fmtTime(a.last) : <span className="t-moss">Still signed in</span>) : ""}</td>
                    <td className="r num small">{a ? mins(a.minutes) : ""}</td>
                    <td>{lv ? <span className="chip chip-leave">{LTYPE[lv.type]}</span> : a ? <span className="chip lv-APPROVED">Present</span> : working ? <span className="small muted">Not signed in</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>
      ) : null}
      <Form action="/attendance" className="panel pad row" style={{ alignItems: "flex-end" }}>
        <div><label className="lbl" htmlFor="a-m">Month</label><AutoSubmit className="field" id="a-m" name="month" defaultValue={month}><Options opts={months} /></AutoSubmit></div>
        {team
          ? <div style={{ minWidth: 200 }}><label className="lbl" htmlFor="a-p">Person</label><AutoSubmit className="field" id="a-p" name="person" defaultValue={personId}><Options opts={[["", "Everyone"], ...userOpts(ctx)]} /></AutoSubmit></div>
          : <p className="small muted">You are seeing your own attendance.</p>}
        <span className="grow" style={{ flex: 1 }} />
        <a className="btn btn-q btn-sm" href={csv} download>Download CSV</a>
      </Form>
      <section className="stack"><h2>{fmtMonth(d.first)} summary</h2>
        <div className="panel tablebox"><table className="t" style={{ minWidth: 820 }}>
          <thead><tr><th>Person</th><th className="r">Days present</th><th className="r">Leave days</th><th className="r">Average sign in</th><th className="r">Average sign out</th><th className="r">Late sign ins</th><th className="r">Total signed in</th></tr></thead>
          <tbody>
            {d.summary.map((s) => (
              <tr key={s.x.id}>
                <td>{team && !personId ? <Link className="link" href={personHref(s.x.id)} style={{ color: "var(--ink)" }}><Person u={s.x} /></Link> : <Person u={s.x} />}</td>
                <td className="r num">{s.present} <span className="muted">of {s.work}</span>{s.extra ? <div className="xs t-moss">plus {s.extra} on a holiday or weekly off</div> : null}</td>
                <td className="r num">{s.lv}</td><td className="r num">{s.avgIn}</td><td className="r num">{s.avgOut}</td>
                <td className={`r num ${s.late ? "t-ochre" : "muted"}`}>{s.late}</td><td className="r num">{mins(s.mn)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="xs muted">Late sign in means after 10:00 AM on a working day. Days present counts working days up to today; time on weekly offs and holidays is added to the total.</p>
      </section>
      {detailFor ? (
        <section className="stack"><h2>Day by day, {detailFor.name}</h2>
          <div className="panel tablebox"><table className="t" style={{ minWidth: 600 }}>
            <thead><tr><th>Date</th><th>Sign in</th><th>Sign out</th><th className="r">Signed in time</th><th>Note</th></tr></thead>
            <tbody>
              {dailyRows(cal, d, detailFor.id).map(({ k, a, h, we, note }) => (
                <tr key={k} className={we || h ? "dim" : ""}>
                  <td className="small num">{fmtShort(k)}</td>
                  <td className="num small">{a ? fmtTime(a.first) : ""}</td>
                  <td className="num small">{a ? (a.last ? fmtTime(a.last) : <span className="t-moss">Still signed in</span>) : ""}</td>
                  <td className="r num small">{a ? mins(a.minutes) : ""}</td>
                  <td>{note.kind === "leave" ? <span className="chip chip-leave">{note.text}</span>
                    : note.kind === "hol" ? <span className="chip chip-hol">{note.text}</span>
                    : note.kind === "off" ? <span className="muted small">{note.text}</span>
                    : note.kind === "absent" ? <span className="small t-rust">{note.text}</span>
                    : note.kind === "late" ? <span className="small t-ochre">{note.text}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      ) : null}
    </>
  );
}
