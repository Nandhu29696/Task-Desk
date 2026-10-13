import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { EMPTYPE, ROLE } from "@/lib/constants";
import { fmtStamp, stampOf } from "@/lib/dates";
import { canAddPeople, canEditPerson, canSeeLog, isAdmin } from "@/lib/permissions";
import { editMe } from "@/app/actions/people";
import { ActionForm, AutoSubmit } from "@/components/client/ActionForm";
import { Icon } from "@/components/Icon";
import { Av, Empty, Options } from "@/components/ui";
import { AddPersonModal, EditPersonModal } from "@/components/people/forms";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const u = ctx.me, adm = isAdmin(u);
  const f = { q: (sp.q || "").trim(), emp: sp.emp || "", loc: sp.loc || "" };
  const editing = sp.edit === "me";

  const locs = [...new Set(ctx.users.map((x) => x.location).filter(Boolean))].sort();
  const list = ctx.users
    .filter((x) => (adm || x.active) && (!f.emp || x.emp === f.emp) && (!f.loc || x.location === f.loc) && (!f.q || (x.name + " " + x.title + " " + x.email).toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  const lastIn = new Map<string, string>();
  if (adm) {
    const rows = await prisma.session.groupBy({ by: ["userId"], _max: { signedInAt: true } });
    for (const r of rows) if (r._max.signedInAt) lastIn.set(r.userId, fmtStamp(stampOf(r._max.signedInAt)));
  }
  const keep = (extra: Record<string, string>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ q: f.q, emp: f.emp, loc: f.loc, ...extra })) if (v) p.set(k, v); const s = p.toString(); return "/people" + (s ? "?" + s : ""); };

  return (
    <>
      <header className="between">
        <div><h1>People</h1><p className="soft">The Search Engineers team: positions, contact numbers and locations.</p></div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-q" href={editing ? keep({}) : keep({ edit: "me" })}>Edit my details</Link>
          {canAddPeople(u) ? <AddPersonModal ctx={ctx} /> : null}
        </div>
      </header>
      {editing ? (
        <section className="panel pad stack"><h2>Your details</h2>
          <ActionForm action={editMe} className="grid4" style={{ alignItems: "end" }}>
            <div><label className="lbl" htmlFor="me-ph">Contact number</label><input className="field" id="me-ph" name="phone" defaultValue={u.phone} placeholder="+91 98765 43210" /></div>
            <div><label className="lbl" htmlFor="me-loc">Location</label><input className="field" id="me-loc" name="location" defaultValue={u.location} placeholder="Coimbatore" /></div>
            <div className="row" style={{ gridColumn: "span 2" }}><button className="btn btn-p">Save</button><Link className="btn btn-q" href={keep({})}>Cancel</Link></div>
          </ActionForm>
          <p className="xs muted">Position and employment type are set by the admin.</p>
        </section>
      ) : null}
      <Form action="/people" className="panel pad row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 200 }}><label className="lbl" htmlFor="df-q">Search</label><input className="field" id="df-q" name="q" defaultValue={f.q} placeholder="Name, position or email, then press Enter" /></div>
        <div style={{ minWidth: 160 }}><label className="lbl" htmlFor="df-e">Type</label><AutoSubmit className="field" id="df-e" name="emp" defaultValue={f.emp}><Options opts={[["", "All types"], ...Object.entries(EMPTYPE)]} /></AutoSubmit></div>
        <div style={{ minWidth: 180 }}><label className="lbl" htmlFor="df-l">Location</label><AutoSubmit className="field" id="df-l" name="loc" defaultValue={f.loc}><Options opts={[["", "All locations"], ...locs.map((l): [string, string] => [l, l])]} /></AutoSubmit></div>
      </Form>
      <div className="dir">
        {list.length ? list.map((x) => {
          const boss = x.reportsTo ? ctx.user(x.reportsTo) : undefined;
          const adder = x.addedBy ? ctx.user(x.addedBy) : undefined;
          const asPerson = { id: x.id, role: x.role, reportsTo: x.reportsTo, addedBy: x.addedBy };
          return (
            <article key={x.id} className={`panel person-card ${x.active ? "" : "dim"}`}>
              <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <Av name={x.name} size={44} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link className="link pname" href={`/people/${x.id}`}>{x.name}{x.id === u.id ? " (you)" : ""}</Link><span className="soft small">{x.title}</span>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <span className={`chip emp-${x.emp}`}>{EMPTYPE[x.emp] || "Not set"}</span>
                    {adm ? <span className={`role role-${x.role}`}>{ROLE[x.role]}</span> : null}
                    {x.active ? null : <span className="chip lv-CANCELLED">Inactive</span>}
                    {ctx.onLeaveToday.has(x.id) ? <span className="chip chip-leave">On leave</span> : null}
                  </div>
                </div>
              </div>
              <dl className="kv">
                <dt>Phone</dt><dd><a href={`tel:${x.phone.replace(/\s/g, "")}`} className="num">{x.phone || "Not added"}</a></dd>
                <dt>Email</dt><dd style={{ wordBreak: "break-all" }}>{x.email}</dd>
                <dt>Location</dt><dd>{x.location || "Not added"}</dd>
                {boss ? <><dt>Reports to</dt><dd>{boss.name}</dd></> : null}
                {adm ? <><dt>Last sign in</dt><dd className="num">{lastIn.get(x.id) || "Never"}</dd></> : null}
              </dl>
              <div className="pcfoot">
                <Link className="btn btn-q btn-sm" href={`/people/${x.id}`}><Icon name="people" /> Profile</Link>
                {canSeeLog(u, asPerson) ? <Link className="btn btn-q btn-sm" href={`/activity?who=${x.id}`}><Icon name="activity" /> Activity log</Link> : null}
                {canEditPerson(u, asPerson) && x.id !== u.id ? <EditPersonModal x={x} ctx={ctx} label={adm ? "Edit details and access" : "Edit details"} /> : null}
                {x.addedBy ? <span className="xs muted">Added by {adder?.name || "someone"}</span> : null}
              </div>
            </article>
          );
        }) : <Empty>No one matches these filters.</Empty>}
      </div>
    </>
  );
}
