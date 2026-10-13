import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/db";
import { getCtx, userOpts } from "@/lib/context";
import { LIVE_STAGES, RENEW_LINES, STAGE, STAGES, SVC, SVC_LINES } from "@/lib/constants";
import { addK, diffK, fmtDate, fmtMonth, fmtShort, inr, startOfWeek } from "@/lib/dates";
import { isAdmin } from "@/lib/permissions";
import { monthlyEq, oneTimeThisMonth, pipelineValue, recurringMonthly, svcLive } from "@/lib/logic";
import { splitList } from "@/lib/model";
import { addClient } from "@/app/actions/clients";
import { ActionForm, AutoSubmit } from "@/components/client/ActionForm";
import { ClientFields } from "@/components/clients/ClientForm";
import { CommsChips, Empty, Stats } from "@/components/ui";
import { StagePill, SvcChips } from "@/components/clients/bits";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getCtx();
  const { me, today: t0 } = ctx;
  if (!isAdmin(me)) return <Empty>Only the admin can see client management.</Empty>;
  const sp = await searchParams;
  const f = { stage: STAGES.includes(sp.stage || "") ? sp.stage! : "", service: SVC_LINES.includes(sp.service || "") ? sp.service! : "", q: (sp.q || "").trim() };
  const adding = sp.add === "1";
  const url = (o: Partial<typeof f> & { add?: boolean }) => {
    const p = new URLSearchParams();
    const v = { ...f, ...o };
    if (v.stage) p.set("stage", v.stage);
    if (v.service) p.set("service", v.service);
    if (v.q) p.set("q", v.q);
    if (o.add ?? adding) p.set("add", "1");
    const s = p.toString();
    return "/clients" + (s ? "?" + s : "");
  };

  const clients = await prisma.client.findMany({ include: { services: true, payments: { select: { amount: true, receivedOn: true } } }, orderBy: { name: "asc" } });
  const m = t0.slice(0, 7), wk = startOfWeek(t0);
  const live = clients.filter((c) => LIVE_STAGES.includes(c.stage));
  const rec = live.reduce((a, c) => a + recurringMonthly(c, t0), 0);
  const one = clients.reduce((a, c) => a + oneTimeThisMonth(c, t0), 0);
  const pays = clients.flatMap((c) => c.payments);
  const recvWeek = pays.filter((p) => p.receivedOn >= wk && p.receivedOn <= t0).reduce((a, p) => a + p.amount, 0);
  const recvMonth = pays.filter((p) => p.receivedOn.slice(0, 7) === m).reduce((a, p) => a + p.amount, 0);
  const projected = rec + one;
  const onboarded = clients.filter((c) => c.onboardedOn && c.onboardedOn.slice(0, 7) === m);
  const renewals = live.filter((c) => c.contractRenewal && c.contractRenewal >= t0 && c.contractRenewal <= addK(t0, 45)).sort((a, b) => (a.contractRenewal! < b.contractRenewal! ? -1 : 1));
  const prodRen = clients
    .filter((c) => c.stage !== "CHURNED")
    .flatMap((c) => c.services.filter((s) => !!s.renewDate && RENEW_LINES.includes(s.line) && svcLive(s, t0) && s.renewDate >= t0 && diffK(s.renewDate, t0) <= 30).map((s) => ({ c, s })))
    .sort((a, b) => (a.s.renewDate < b.s.renewDate ? -1 : 1));
  const mix = SVC_LINES.map((l) => {
    const items = live.flatMap((c) => c.services.filter((s) => s.line === l && svcLive(s, t0)).map((s) => ({ s, c })));
    const r = items.filter((x) => x.s.type === "RECURRING"), o = items.filter((x) => x.s.type === "ONE_TIME");
    return { l, rc: new Set(r.map((x) => x.c.id)).size, oc: o.length, rv: r.reduce((a, x) => a + monthlyEq(x.s), 0), ov: o.reduce((a, x) => a + x.s.price, 0) };
  }).filter((x) => x.rc || x.oc);
  const list = clients
    .filter((c) => (!f.stage || c.stage === f.stage) && (!f.service || c.services.some((s) => s.line === f.service)) && (!f.q || `${c.name} ${c.pocName} ${c.city}`.toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.name.localeCompare(b.name));
  const count = (st: string) => clients.filter((c) => c.stage === st).length;

  return (
    <>
      <header className="between">
        <div><h1>Clients</h1><p className="soft">Who we work with, what they pay, what we deliver and who to call. Only the admin sees this page.</p></div>
        <Link className="btn btn-p" href={url({ add: !adding })}>{adding ? "Close" : "Add a client"}</Link>
      </header>
      {adding ? (
        <section className="panel pad stack"><h2>Add a client</h2>
          <ActionForm action={addClient} className="stack">
            <ClientFields users={userOpts(ctx)} meId={me.id} />
            <div><button className="btn btn-p">Add client</button></div>
          </ActionForm>
        </section>
      ) : null}
      <Stats cls="four" items={[
        ["Active clients", live.length, "", `${count("ACTIVE")} active, ${count("ONBOARDING")} onboarding`],
        ["Monthly recurring", inr(rec), "t-moss", "from running retainers"],
        ["Monthly total", inr(projected), "", `${inr(rec)} recurring + ${inr(one)} one time`],
        ["Upcoming renewals", renewals.length + prodRen.length, renewals.length + prodRen.length ? "t-ochre" : "", `${prodRen.length} domain, hosting or AMC, ${renewals.length} contracts`],
      ]} />
      <Stats items={[
        ["Ongoing clients", <>{live.length} <span className="muted" style={{ fontSize: 16 }}>of {clients.length}</span></>, "", "all clients ever added"],
        ["Onboarded this month", onboarded.length, "", onboarded.map((c) => c.name).join(", ") || "None yet"],
        ["Received this week", inr(recvWeek), "t-moss", `since ${fmtShort(wk)}`],
        ["Received this month", inr(recvMonth), "", `of ${inr(projected)} projected`],
        ["Still to collect", inr(Math.max(0, projected - recvMonth)), projected - recvMonth > 0 ? "t-ochre" : "", fmtMonth(t0)],
      ]} />
      <div className="grid2" style={{ alignItems: "start" }}>
        <section className="panel pad stack"><h2>Services we provide</h2>
          <div className="tablebox"><table className="t"><thead><tr><th>Service</th><th className="r">Recurring clients</th><th className="r">Monthly value</th><th className="r">One time projects</th><th className="r">One time value</th></tr></thead>
            <tbody>{mix.map((x) => <tr key={x.l}><td>{SVC[x.l]}</td><td className="r num">{x.rc}</td><td className="r num">{inr(x.rv)}</td><td className="r num">{x.oc}</td><td className="r num">{inr(x.ov)}</td></tr>)}</tbody></table></div>
          <p className="xs muted">Counts running services for active and onboarding clients. One time projects count until their completed date.</p>
        </section>
        <section className="panel pad stack"><h2>Upcoming renewals</h2>
          <h3 className="small soft">Domain, hosting and AMC in the next 30 days</h3>
          {prodRen.length ? <ul className="feed">{prodRen.map(({ c, s }) => (
            <li key={s.id} className="between" style={{ alignItems: "center", gap: 8 }}>
              <span><Link className="link" href={`/clients/${c.id}`}>{c.name}</Link><div className="xs soft">{SVC[s.line]}: {s.item || ""}{s.provider ? ", " + s.provider : ""}</div></span>
              <span className="small num" style={{ textAlign: "right" }}>{fmtDate(s.renewDate)}<div className={`xs ${diffK(s.renewDate, t0) <= 7 ? "t-rust" : "t-ochre"}`}>in {diffK(s.renewDate, t0)} days, {inr(s.price)}</div></span>
            </li>
          ))}</ul> : <p className="small muted">Nothing due in the next 30 days.</p>}
          <h3 className="small soft" style={{ marginTop: 6 }}>Client contracts in the next 45 days</h3>
          {renewals.length ? <ul className="feed">{renewals.map((c) => <li key={c.id} className="between" style={{ alignItems: "center" }}><Link className="link" href={`/clients/${c.id}`}>{c.name}</Link><span className="small num">{fmtDate(c.contractRenewal)}, {inr(recurringMonthly(c, t0))} a month</span></li>)}</ul> : <p className="small muted">No contract renewals in the next 45 days.</p>}
        </section>
      </div>
      <div className="pipe">{STAGES.map((st) => {
        const n = clients.filter((c) => c.stage === st);
        return (
          <Link key={st} className={`pipe-step ${f.stage === st ? "on" : ""}`} href={url({ stage: f.stage === st ? "" : st })} aria-pressed={f.stage === st}>
            <span className="xs soft">{STAGE[st]}</span><b className="num">{n.length}</b>
            <span className="xs muted num">{inr(n.reduce((a, c) => a + (LIVE_STAGES.includes(st) ? recurringMonthly(c, t0) : pipelineValue(c)), 0))}</span>
          </Link>
        );
      })}</div>
      <Form action="/clients" className="panel pad row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 200 }}><label className="lbl" htmlFor="cf-q">Search</label><input className="field" id="cf-q" name="q" defaultValue={f.q} placeholder="Client, contact or city, then press Enter" /></div>
        <div style={{ minWidth: 170 }}><label className="lbl" htmlFor="cf-s">Stage</label>
          <AutoSubmit className="field" id="cf-s" name="stage" defaultValue={f.stage} key={"s" + f.stage}><option value="">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{STAGE[s]}</option>)}</AutoSubmit></div>
        <div style={{ minWidth: 190 }}><label className="lbl" htmlFor="cf-v">Service</label>
          <AutoSubmit className="field" id="cf-v" name="service" defaultValue={f.service} key={"v" + f.service}><option value="">All services</option>{SVC_LINES.map((x) => <option key={x} value={x}>{SVC[x]}</option>)}</AutoSubmit></div>
      </Form>
      {list.length ? (
        <div className="panel tablebox"><table className="t" style={{ minWidth: 1060 }}>
          <thead><tr><th>Client</th><th>Stage</th><th>Services</th><th className="r">Monthly</th><th className="r">One time</th><th>Point of contact</th><th>Renewal</th><th></th></tr></thead>
          <tbody data-clamp="list">{list.map((c) => {
            const pending = ["LEAD", "PROPOSAL", "NEGOTIATION", "ONBOARDING"].includes(c.stage);
            const ot = c.services.filter((s) => s.type === "ONE_TIME").reduce((a, s) => a + s.price, 0);
            return (
              <tr key={c.id} className={["CHURNED", "COMPLETED"].includes(c.stage) ? "dim" : ""}>
                <td><Link className="tl-title" style={{ fontWeight: 600 }} href={`/clients/${c.id}`}>{c.name}</Link><div className="xs muted">{c.industry || ""}{c.city ? ", " + c.city : ""}</div></td>
                <td><StagePill st={c.stage} /></td>
                <td style={{ maxWidth: 260 }}><SvcChips list={c.services} /></td>
                <td className="r num">{inr(pending ? c.services.filter((s) => s.type === "RECURRING").reduce((a, s) => a + monthlyEq(s), 0) : recurringMonthly(c, t0))}</td>
                <td className="r num">{ot ? inr(ot) : <span className="muted">None</span>}</td>
                <td className="small"><b>{c.pocName}</b><div className="xs muted">{c.pocRole}</div><div className="xs num">{c.pocPhone}</div><div><CommsChips list={splitList(c.comms)} /></div></td>
                <td className="small num">{c.contractRenewal ? <>{fmtDate(c.contractRenewal)}{LIVE_STAGES.includes(c.stage) && c.contractRenewal <= addK(t0, 45) && c.contractRenewal >= t0 ? <div className="xs t-ochre">Due soon</div> : null}</> : <span className="muted">Not set</span>}</td>
                <td className="r">{pending ? <Link className="btn btn-p btn-sm" href={`/clients/${c.id}?live=1#golive`}>Move to live</Link> : null}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      ) : <Empty>No clients match these filters.</Empty>}
    </>
  );
}
