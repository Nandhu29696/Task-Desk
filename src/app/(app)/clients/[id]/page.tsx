import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx, userOpts } from "@/lib/context";
import { CYCLE, LINE, LINES, OPEN, RENEW_LINES, STAGE, STAGES, SVC, TPL_LINES, toProjLine } from "@/lib/constants";
import { addK, diffK, fmtDate, inr } from "@/lib/dates";
import { isAdmin } from "@/lib/permissions";
import { monthlyEq, svcLive } from "@/lib/logic";
import { splitList } from "@/lib/model";
import { addContact, addNote, addPayment, completeService, editClient, goLive, removeContact, removePayment, renewService, setStage } from "@/app/actions/clients";
import { ActionForm, AutoSubmit } from "@/components/client/ActionForm";
import { ConfirmButton, CopyButton, Modal } from "@/components/client/Widgets";
import { CancelButton, ClientFields, type ClientInit } from "@/components/clients/ClientForm";
import { StagePill } from "@/components/clients/bits";
import { Icon } from "@/components/Icon";
import { CommsChips, Empty, Person, Stats } from "@/components/ui";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getCtx();
  const { me, today: t0 } = ctx;
  if (!isAdmin(me)) return <Empty>Only the admin can see client management.</Empty>;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await prisma.client.findUnique({
    where: { id },
    include: {
      services: true, contacts: true,
      payments: { orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }] },
      notesLog: { orderBy: [{ on: "desc" }, { createdAt: "desc" }], include: { by: { select: { name: true } } } },
      projects: { orderBy: { name: "asc" }, include: { lead: { select: { name: true } } } },
      _count: { select: { credentials: true } },
    },
  });
  if (!c) return <Empty>Client not found.</Empty>;
  const pids = c.projects.map((p) => p.id);
  const openTasks = pids.length ? await prisma.task.findMany({ where: { projectId: { in: pids }, status: { in: OPEN } }, select: { projectId: true, dueDate: true } }) : [];
  const od = openTasks.filter((t) => t.dueDate && t.dueDate < t0).length;
  const logins = c._count.credentials;
  const paid = c.payments.reduce((a, p) => a + p.amount, 0);
  const pending = ["LEAD", "PROPOSAL", "NEGOTIATION", "ONBOARDING"].includes(c.stage);
  const recAll = c.services.filter((s) => s.type === "RECURRING" && svcLive(s, t0)).reduce((a, s) => a + monthlyEq(s), 0);
  const otAll = c.services.filter((s) => s.type === "ONE_TIME").reduce((a, s) => a + s.price, 0);
  const otN = c.services.filter((s) => s.type === "ONE_TIME").length;
  const renewSoon = (s: (typeof c.services)[number]) => !!s.renewDate && RENEW_LINES.includes(s.line) && svcLive(s, t0) && s.renewDate >= t0 && diffK(s.renewDate, t0) <= 30;
  const comms = splitList(c.comms);
  const showLive = sp.live === "1";
  const lines = [...new Set(c.services.map((s) => toProjLine(s.line)))];
  const init: ClientInit = {
    name: c.name, industry: c.industry || "Other", stage: c.stage, ownerId: c.ownerId, renewal: c.contractRenewal || "", city: c.city, gst: c.gst, website: c.website, address: c.address, notes: c.notes, comms,
    poc: { name: c.pocName, role: c.pocRole, phone: c.pocPhone, email: c.pocEmail },
    services: c.services.map((s) => ({ id: s.id, line: s.line, type: s.type, price: s.price, cycle: s.cycle, startDate: s.startDate, completedDate: s.completedDate, item: s.item, provider: s.provider, renewDate: s.renewDate })),
  };

  return (
    <>
      <header className="stack" style={{ gap: 4 }}>
        <Link className="link small" href="/clients" style={{ justifySelf: "start" }}>All clients</Link>
        <div className="between">
          <div><h1>{c.name}</h1><p className="soft">{c.industry || ""}{c.city ? ", " + c.city : ""} <StagePill st={c.stage} /></p></div>
          <div className="row">
            {pending ? <Link className="btn btn-p" href={`/clients/${c.id}?live=1#golive`}>Move to live</Link> : null}
            <Modal title="Edit client details and pricing" wide trigger={<><Icon name="edit" /> Edit</>} triggerClass="btn btn-q">
              <ActionForm action={editClient} className="stack">
                <input type="hidden" name="id" value={c.id} />
                <ClientFields client={init} users={userOpts(ctx)} meId={me.id} />
                <div className="between"><div className="row"><button className="btn btn-p">Save client</button><CancelButton /></div><ConfirmButton label="Delete client" name="intent" value="delete" /></div>
              </ActionForm>
            </Modal>
            <ActionForm action={setStage} className="row" style={{ gap: 8 }}>
              <input type="hidden" name="id" value={c.id} />
              <label className="small soft" htmlFor="cs">Stage</label>
              <AutoSubmit className="field" id="cs" name="stage" defaultValue={c.stage} key={c.stage} style={{ width: "auto" }}>{STAGES.map((s) => <option key={s} value={s}>{STAGE[s]}</option>)}</AutoSubmit>
            </ActionForm>
          </div>
        </div>
      </header>

      {showLive ? (
        <section className="panel pad stack" id="golive">
          <div className="between" style={{ alignItems: "center" }}><h2>Move {c.name} to live</h2><Link className="x" href={`/clients/${c.id}`} aria-label="Close">&times;</Link></div>
          <p className="small soft">Creates a project so leads and members can plan and assign tasks under it. The client moves to Active.</p>
          <ActionForm action={goLive} className="stack">
            <input type="hidden" name="id" value={c.id} />
            <div className="grid2">
              <div><label className="lbl">Project name</label><input className="field" name="name" defaultValue={`${c.name} ${SVC[c.services[0]?.line] || ""}`.trim()} required /></div>
              <div><label className="lbl">Main service line</label><select className="field" name="line" defaultValue={lines.find((l) => LINES.includes(l)) || "SEO"}>{LINES.map((x) => <option key={x} value={x}>{LINE[x]}</option>)}</select></div>
              <div><label className="lbl">Project lead</label><select className="field" name="leadId" defaultValue={c.ownerId || ""}>{ctx.active.filter((x) => x.role !== "MEMBER").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
              <div><label className="lbl">Go live date</label><input className="field" type="date" name="start" defaultValue={t0} /></div>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="lbl">Team</legend>
              <div className="checks">{ctx.active.map((x) => <label key={x.id} className="check"><input type="checkbox" name="m" value={x.id} />{x.name}</label>)}</div>
            </fieldset>
            <label className="check"><input type="checkbox" name="tpl" defaultChecked />Add starter recurring tasks for: {lines.filter((l) => TPL_LINES.includes(l)).map((l) => LINE[l]).join(", ") || "none of these services"}</label>
            <div><button className="btn btn-p">Create project and move to live</button></div>
          </ActionForm>
        </section>
      ) : null}

      <Stats items={[
        ["Recurring", inr(recAll), "", "per month"],
        ["One time projects", inr(otAll), "", `${otN} ${otN === 1 ? "project" : "projects"}`],
        ["Received so far", inr(paid), "t-moss", `${c.payments.length} ${c.payments.length === 1 ? "payment" : "payments"}`],
        ["Open tasks", openTasks.length, "", `${od} overdue`],
        ["Renewal", c.contractRenewal ? fmtDate(c.contractRenewal) : "Not set", c.contractRenewal && c.contractRenewal <= addK(t0, 45) && c.contractRenewal >= t0 ? "t-ochre" : "", c.onboardedOn ? "live since " + fmtDate(c.onboardedOn) : "not live yet"],
      ]} />

      <div className="split" style={{ "--aside": "360px" } as React.CSSProperties}>
        <div className="stack-lg">
          <section className="panel pad stack"><h2>Services and pricing</h2>
            {c.services.length ? (
              <div className="tablebox"><table className="t" style={{ minWidth: 820 }}>
                <thead><tr><th>Service or product</th><th>Type</th><th className="r">Price</th><th>Started</th><th>Renews</th><th>Completed</th></tr></thead>
                <tbody>{c.services.map((s) => (
                  <tr key={s.id} className={s.completedDate && s.completedDate < t0 ? "dim" : ""}>
                    <td>{SVC[s.line]}{s.item ? <div className="xs muted">{s.item}{s.provider ? ", " + s.provider : ""}</div> : null}</td>
                    <td className="small">{s.type === "RECURRING" ? "Recurring" : "One time project"}</td>
                    <td className="r num">{inr(s.price)} <span className="xs muted">{s.type === "RECURRING" ? CYCLE[s.cycle || "MONTHLY"] : "once"}</span></td>
                    <td className="small num">{s.startDate ? fmtDate(s.startDate) : <span className="muted">Not started</span>}</td>
                    <td className="small num">{s.renewDate ? <>{fmtDate(s.renewDate)}{renewSoon(s) ? <>
                      <div className="xs t-ochre">In {diffK(s.renewDate, t0)} days</div>
                      <ActionForm action={renewService}><input type="hidden" name="sv" value={s.id} /><button className="btn btn-q btn-sm" style={{ marginTop: 4 }}>Renewed for 1 year</button></ActionForm>
                    </> : null}</> : <span className="muted">None</span>}</td>
                    <td className="small num">{s.completedDate ? fmtDate(s.completedDate) : (
                      <ActionForm action={completeService}><input type="hidden" name="sv" value={s.id} /><button className="btn btn-q btn-sm">Mark completed today</button></ActionForm>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <p className="small muted">No services yet.</p>}
            {c.notes ? <p style={{ whiteSpace: "pre-wrap" }} data-clamp="text">{c.notes}</p> : null}
            <dl className="kv">
              {c.website ? <><dt>Website</dt><dd><a href={c.website} target="_blank" rel="noreferrer">{c.website}</a></dd></> : null}
              {c.gst ? <><dt>GST</dt><dd className="num">{c.gst}</dd></> : null}
              {c.address ? <><dt>Address</dt><dd>{c.address}</dd></> : null}
              <dt>Account manager</dt><dd><Person u={ctx.user(c.ownerId)} size={20} /></dd>
            </dl>
          </section>

          <section className="panel pad stack">
            <div className="between" style={{ alignItems: "center" }}><h2>Payments received</h2><span className="small muted num">{inr(paid)} in total</span></div>
            <ActionForm action={addPayment} reset className="srow payrow">
              <input type="hidden" name="id" value={c.id} />
              <input className="field" type="number" min={1} step={1} name="amount" required placeholder="Amount ₹" aria-label="Amount" />
              <input className="field" type="date" name="on" defaultValue={t0} aria-label="Date received" />
              <input className="field" name="note" placeholder="Invoice number or note" aria-label="Note" />
              <button className="btn btn-p">Add</button>
            </ActionForm>
            {c.payments.length ? <ul className="feed" data-clamp="list">{c.payments.map((p) => (
              <li key={p.id} className="between" style={{ alignItems: "center" }}>
                <span><b className="num">{inr(p.amount)}</b> <span className="soft small">{p.note}</span></span>
                <span className="row small num" style={{ gap: 8 }}>{fmtDate(p.receivedOn)}
                  <ActionForm action={removePayment} style={{ display: "contents" }}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="p" value={p.id} /><button className="x" aria-label="Remove payment" title="Remove">&times;</button></ActionForm>
                </span>
              </li>
            ))}</ul> : <p className="small muted">No payments recorded yet.</p>}
          </section>

          <section className="panel pad stack">
            <div className="between" style={{ alignItems: "center" }}><h2>Projects</h2><Link className="btn btn-q btn-sm" href={`/projects/new?client=${c.id}`}>New project for this client</Link></div>
            {c.projects.length ? c.projects.map((p) => (
              <div key={p.id} className="between" style={{ alignItems: "center", borderTop: "1px solid var(--line2)", paddingTop: 8 }}>
                <span><Link className="tl-title" href={`/projects/${p.id}`}>{p.name}</Link><div className="xs muted">{LINE[p.line] || p.line}, lead {p.lead?.name || ""}</div></span>
                <span className="small num">{openTasks.filter((t) => t.projectId === p.id).length} open</span>
              </div>
            )) : <p className="small muted">No projects yet. Use Move to live or New project for this client.</p>}
          </section>

          <section className="panel pad stack"><h2>Notes and follow ups</h2>
            <ActionForm action={addNote} reset className="srow noterow">
              <input type="hidden" name="id" value={c.id} />
              <input className="field" name="text" required placeholder="Call summary, decision or follow up" aria-label="Note" />
              <input className="field" type="date" name="on" defaultValue={t0} aria-label="Date" />
              <button className="btn btn-p">Add</button>
            </ActionForm>
            {c.notesLog.length ? <ol className="feed" data-clamp="list">{c.notesLog.map((n) => <li key={n.id}><b>{n.by?.name || "Admin"}</b> <span className="soft">{n.text}</span><time>{fmtDate(n.on)}</time></li>)}</ol> : <p className="small muted">No notes yet.</p>}
          </section>
        </div>

        <aside className="stack-lg">
          <section className="panel pad stack"><h3>Point of contact</h3>
            <div className="contact">
              <b>{c.pocName}</b><span className="soft small">{c.pocRole}</span>
              {c.pocPhone ? <span className="row small" style={{ gap: 8 }}><a href={`tel:${c.pocPhone.replace(/\s/g, "")}`} className="num">{c.pocPhone}</a><CopyButton text={c.pocPhone} label="Copy phone number" /></span> : null}
              {c.pocEmail ? <span className="row small" style={{ gap: 8, wordBreak: "break-all" }}><span>{c.pocEmail}</span><CopyButton text={c.pocEmail} label="Copy email" /></span> : null}
            </div>
            <div><span className="xs muted">Prefers</span><div className="row" style={{ gap: 6, marginTop: 4 }}>{comms.length ? <CommsChips list={comms} /> : <span className="small muted">Not set</span>}</div></div>
          </section>
          <section className="panel pad stack"><h3>Other contacts</h3>
            {c.contacts.length ? c.contacts.map((k) => (
              <div key={k.id} className="contact" style={{ borderTop: "1px solid var(--line2)", paddingTop: 8 }}>
                <div className="between" style={{ alignItems: "center" }}><b>{k.name}</b>
                  <ActionForm action={removeContact} style={{ display: "contents" }}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="k" value={k.id} /><button className="x" aria-label="Remove contact" title="Remove">&times;</button></ActionForm>
                </div>
                <span className="soft small">{k.role}</span><span className="small num">{k.phone}</span><span className="small" style={{ wordBreak: "break-all" }}>{k.email}</span>
              </div>
            )) : <p className="small muted">None added.</p>}
            <details><summary className="sumlink">Add a contact</summary>
              <ActionForm action={addContact} reset className="stack" style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={c.id} />
                <input className="field" name="name" required placeholder="Name" aria-label="Name" />
                <input className="field" name="role" placeholder="Position" aria-label="Position" />
                <input className="field" name="phone" placeholder="Phone" aria-label="Phone" />
                <input className="field" type="email" name="email" placeholder="Email" aria-label="Email" />
                <div><button className="btn btn-p btn-sm">Add contact</button></div>
              </ActionForm>
            </details>
          </section>
          <section className="panel pad stack"><h3>Saved credentials</h3>
            {logins ? <><p className="small">{logins} {logins === 1 ? "login" : "logins"} for this client.</p><div><Link className="btn btn-q btn-sm" href={`/credentials?tab=CLIENT&client=${c.id}`}>Open in Credentials</Link></div></> : <p className="small muted">No saved logins.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
