import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { LSTATUS, LTYPE } from "@/lib/constants";
import { addK, fmtDate, fmtShort } from "@/lib/dates";
import { isWeekend, leaveDays, nthWorking } from "@/lib/calendar";
import { canApproveLeave, isAdmin, isLeadOrAdmin } from "@/lib/permissions";
import { loadLeaves, type Leave } from "@/lib/model";
import { cancelLeave, decideLeave, requestLeave, saveAllowances, takeRestrictedHoliday } from "@/app/actions/office";
import { ActionForm } from "@/components/client/ActionForm";
import { ConfirmButton } from "@/components/client/Widgets";
import { Empty, Options, Person } from "@/components/ui";

export default async function LeavePage() {
  const ctx = await getCtx();
  const u = ctx.me, cal = ctx.cal, t0 = ctx.today, yr = t0.slice(0, 4), A = cal.settings.allow, rhLimit = cal.settings.rhLimit;
  const [leaves, leavePolicy] = await Promise.all([
    loadLeaves({ OR: [{ userId: u.id }, { fromDate: { startsWith: yr } }, { status: "PENDING" }, { status: "APPROVED", toDate: { gte: t0 }, fromDate: { lte: addK(t0, 60) } }] }),
    prisma.policy.findFirst({ where: { title: { contains: "eave" } }, select: { id: true } }),
  ]);
  const days = (l: Leave) => leaveDays(cal, l);
  const mine = leaves.filter((l) => l.userId === u.id).sort((a, b) => (a.from < b.from ? 1 : -1));
  const used = (type: string, who = u.id) => leaves.filter((l) => l.userId === who && l.type === type && l.status === "APPROVED" && l.from.startsWith(yr)).reduce((a, l) => a + days(l), 0);
  const pending = (type: string) => leaves.filter((l) => l.userId === u.id && l.type === type && l.status === "PENDING").reduce((a, l) => a + days(l), 0);
  const queue = leaves.filter((l) => l.status === "PENDING" && canApproveLeave(u, l.userId)).sort((a, b) => (a.from < b.from ? -1 : 1));
  const upcomingTeam = isLeadOrAdmin(u) ? leaves.filter((l) => l.status === "APPROVED" && l.to >= t0 && l.from <= addK(t0, 60)).sort((a, b) => (a.from < b.from ? -1 : 1)) : [];
  const range = (l: Leave) => (l.from === l.to ? fmtDate(l.from) : `${fmtShort(l.from)} to ${fmtDate(l.to)}`);
  const rhTaken = leaves.filter((l) => l.userId === u.id && l.type === "RH" && ["APPROVED", "PENDING"].includes(l.status) && l.from.startsWith(yr));
  const rhList = cal.holidays.filter((h) => h.type === "RESTRICTED" && h.date.startsWith(yr)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const rhLeft = rhLimit - rhTaken.length;
  const types = Object.entries(LTYPE).filter(([k]) => k !== "RH");
  const nextDay = nthWorking(cal, t0, 1, 1);

  return (
    <>
      <header><h1>Leave</h1><p className="soft">Request leave, see your balance and follow approvals. All leave is approved by the admin.</p></header>
      <section className="balance">
        {Object.entries(A).map(([k, n]) => {
          const left = n - used(k), p = pending(k);
          return <div key={k} className="panel"><div className="small soft">{LTYPE[k]}</div><b>{left}</b> <span className="small muted">of {n} days left</span>{p ? <div className="xs t-ochre">{p} pending approval</div> : <div className="xs muted">{used(k)} used in {yr}</div>}</div>;
        })}
        <div className="panel"><div className="small soft">Restricted holidays</div><b>{Math.max(0, rhLeft)}</b> <span className="small muted">of {rhLimit} left</span><div className="xs muted">{rhTaken.length ? rhTaken.map((l) => cal.holidays.find((h) => h.date === l.from)?.name || fmtShort(l.from)).join(", ") : "Pick from the list below"}</div></div>
        <div className="panel"><div className="small soft">Comp off and unpaid</div><b>{used("COMPOFF") + used("UNPAID")}</b> <span className="small muted">days taken</span><div className="xs muted">No fixed balance</div></div>
      </section>
      {queue.length ? (
        <section className="stack"><h2>Waiting for your approval</h2>
          <div className="panel tablebox"><table className="t" style={{ minWidth: 820 }}>
            <thead><tr><th>Person</th><th>Type</th><th>Dates</th><th className="r">Days</th><th>Balance after</th><th>Reason</th><th className="r">Decision</th></tr></thead>
            <tbody>
              {queue.map((l) => {
                const bal = A[l.type] != null ? `${A[l.type] - used(l.type, l.userId) - days(l)} of ${A[l.type]}`
                  : l.type === "RH" ? `${rhLimit - leaves.filter((x) => x.userId === l.userId && x.type === "RH" && x.status === "APPROVED" && x.from.startsWith(yr)).length - 1} of ${rhLimit}` : "No limit";
                return (
                  <tr key={l.id}>
                    <td><Person u={ctx.user(l.userId)} /></td><td className="small">{LTYPE[l.type]}</td><td className="small num">{range(l)}{l.half ? ", half day" : ""}</td><td className="r num">{days(l)}</td><td className="small num">{bal}</td><td className="small soft" style={{ maxWidth: 220 }}>{l.reason}</td>
                    <td className="r"><ActionForm action={decideLeave} className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 8 }}><input type="hidden" name="id" value={l.id} /><button className="btn btn-p btn-sm" name="s" value="APPROVED">Approve</button><button className="btn btn-d btn-sm" name="s" value="REJECTED">Reject</button></ActionForm></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>
      ) : isAdmin(u) ? <p className="small muted">No leave requests waiting for approval.</p> : null}
      <div className="split" style={{ ["--aside" as string]: "380px" }}>
        <section className="stack"><h2>Your requests</h2>
          {mine.length ? (
            <div className="panel tablebox"><table className="t" style={{ minWidth: 600 }}>
              <thead><tr><th>Type</th><th>Dates</th><th className="r">Days</th><th>Status</th><th className="r"></th></tr></thead>
              <tbody>
                {mine.map((l) => (
                  <tr key={l.id}>
                    <td className="small">{LTYPE[l.type]}<div className="xs muted">{l.reason}</div></td>
                    <td className="small num">{range(l)}{l.half ? ", half day" : ""}</td><td className="r num">{days(l)}</td>
                    <td><span className={`chip lv-${l.status}`}>{LSTATUS[l.status]}</span>{l.decidedBy ? <div className="xs muted">by {ctx.user(l.decidedBy)?.name}</div> : null}</td>
                    <td className="r">{l.status === "PENDING" || (l.status === "APPROVED" && l.from > t0) ? <ActionForm action={cancelLeave} style={{ display: "inline" }}><input type="hidden" name="id" value={l.id} /><ConfirmButton label="Cancel" className="btn btn-q btn-sm" /></ActionForm> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <Empty>No leave requests yet.</Empty>}
          <h2 style={{ marginTop: 12 }}>Restricted holidays in {yr}</h2>
          <p className="small soft" style={{ marginTop: -6 }}>Choose up to {rhLimit} personal days from this list. You have {Math.max(0, rhLeft)} left.</p>
          <div className="panel tablebox"><table className="t"><tbody>
            {rhList.map((h) => {
              const mineL = rhTaken.find((l) => l.from === h.date), past = h.date <= t0, off = isWeekend(cal, h.date);
              return (
                <tr key={h.id} className={past ? "dim" : ""}>
                  <td className="small num" style={{ whiteSpace: "nowrap" }}>{fmtShort(h.date)}</td><td>{h.name}</td>
                  <td className="r">{mineL ? <span className={`chip lv-${mineL.status}`}>{LSTATUS[mineL.status]}</span>
                    : past ? <span className="xs muted">Passed</span>
                    : off ? <span className="xs muted">Falls on weekly off</span>
                    : rhLeft > 0 ? <ActionForm action={takeRestrictedHoliday} style={{ display: "inline" }}><input type="hidden" name="d" value={h.date} /><button className="btn btn-q btn-sm">Take this day</button></ActionForm>
                    : <span className="xs muted">Limit reached</span>}</td>
                </tr>
              );
            })}
          </tbody></table></div>
          {upcomingTeam.length ? <>
            <h2 style={{ marginTop: 12 }}>Team leave in the next 60 days</h2>
            <ul className="panel pad feed">{upcomingTeam.map((l) => <li key={l.id} className="between" style={{ alignItems: "center" }}><Person u={ctx.user(l.userId)} /><span className="small soft">{LTYPE[l.type]}, {range(l)}{l.half ? ", half day" : ""}</span></li>)}</ul>
          </> : null}
        </section>
        <div className="stack-lg">
          <section className="panel pad stack"><h2>Request leave</h2>
            <ActionForm action={requestLeave} reset className="stack">
              <div><label className="lbl" htmlFor="lv-t">Type</label><select className="field" id="lv-t" name="type" defaultValue="CASUAL"><Options opts={types} /></select></div>
              <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                <div><label className="lbl" htmlFor="lv-f">From</label><input className="field" id="lv-f" type="date" name="from" required defaultValue={nextDay} /></div>
                <div><label className="lbl" htmlFor="lv-to">To</label><input className="field" id="lv-to" type="date" name="to" required defaultValue={nextDay} /></div>
              </div>
              <label className="check"><input type="checkbox" name="half" />Half day (single day only)</label>
              <div><label className="lbl" htmlFor="lv-r">Reason</label><textarea className="field" id="lv-r" name="reason" rows={2} required placeholder="Short reason for the admin" /></div>
              <p className="xs muted">Weekly offs and public holidays are not counted. Read the <Link className="link xs" href={leavePolicy ? `/policies?id=${leavePolicy.id}` : "/policies"}>leave policy</Link> before applying.</p>
              <div><button className="btn btn-p">Send request</button></div>
            </ActionForm>
          </section>
          {isAdmin(u) ? (
            <section className="panel pad stack"><h2>Leave allowance per year</h2>
              <ActionForm action={saveAllowances} className="stack">
                <div className="grid2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                  {Object.keys(A).map((k) => <div key={k}><label className="lbl" htmlFor={`al-${k}`}>{LTYPE[k]}</label><input className="field" id={`al-${k}`} type="number" min={0} max={60} name={k} defaultValue={A[k]} /></div>)}
                  <div><label className="lbl" htmlFor="al-RH">Restricted holidays</label><input className="field" id="al-RH" type="number" min={0} max={10} name="RH" defaultValue={rhLimit} /></div>
                </div>
                <div><button className="btn btn-q btn-sm">Save allowances</button></div>
              </ActionForm>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
