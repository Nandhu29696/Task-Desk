import Link from "next/link";
import Form from "next/form";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { ACCESS } from "@/lib/constants";
import { fmtDate, fmtStamp, stampOf } from "@/lib/dates";
import { credLevel, isAdmin } from "@/lib/permissions";
import { addCredential, editCredential, revealCredential, setAccess } from "@/app/actions/credentials";
import { ActionForm, AutoSubmit } from "@/components/client/ActionForm";
import { ConfirmButton, CopyButton, Modal, SecretBox } from "@/components/client/Widgets";
import { CancelButton } from "@/components/clients/ClientForm";
import { CredFields } from "@/components/clients/CredFields";
import { Icon } from "@/components/Icon";
import { Empty } from "@/components/ui";

// Never select passwordEnc for lists: the password is fetched only by revealCredential.
const credSelect = { id: true, scope: true, clientId: true, name: true, url: true, username: true, notes: true, leadAccess: true, memberAccess: true, changedOn: true, client: { select: { name: true } } } as const;

export default async function CredentialsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getCtx();
  const { me } = ctx;
  const admin = isAdmin(me);
  const sp = await searchParams;
  const tab = sp.tab === "INTERNAL" ? "INTERNAL" : "CLIENT";
  const f = { client: tab === "CLIENT" ? sp.client || "" : "", q: (sp.q || "").trim() };
  const adding = admin && sp.add === "1";
  const url = (o: { tab?: string; add?: boolean }) => {
    const p = new URLSearchParams();
    const t = o.tab ?? tab;
    if (t !== "CLIENT") p.set("tab", t);
    if (!o.tab) { if (f.client) p.set("client", f.client); if (f.q) p.set("q", f.q); }
    if (o.add ?? adding) p.set("add", "1");
    const s = p.toString();
    return "/credentials" + (s ? "?" + s : "");
  };

  const visible: Prisma.CredentialWhereInput = admin ? {} : me.role === "LEAD" ? { leadAccess: { not: "NONE" } } : { memberAccess: { not: "NONE" } };
  const [all, clients, log] = await Promise.all([
    prisma.credential.findMany({ where: visible, select: credSelect }),
    admin ? prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    admin ? prisma.credentialView.findMany({ where: { toolId: null }, orderBy: { createdAt: "desc" }, take: 15, include: { user: { select: { name: true } } } }) : Promise.resolve([]),
  ]);
  if (!admin && !all.length) return <Empty>No credentials have been shared with you.</Empty>;

  const cn = (v: (typeof all)[number]) => v.client?.name || "No client";
  const list = all
    .filter((v) => v.scope === tab && (!f.client || v.clientId === f.client) && (!f.q || `${v.name} ${v.username} ${v.url}`.toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => ((a.client?.name || "") + a.name).localeCompare((b.client?.name || "") + b.name));
  const clientFilter = [...new Map(all.filter((v) => v.clientId).map((v) => [v.clientId!, cn(v)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const clientOpts: [string, string][] = clients.map((c) => [c.id, c.name]);

  let lastClient: string | null | undefined;
  const rows = list.map((v) => {
    let head = null;
    if (tab === "CLIENT" && v.clientId !== lastClient) {
      lastClient = v.clientId;
      head = <div className="credgroup">{v.clientId && admin ? <Link className="link" href={`/clients/${v.clientId}`}>{cn(v)}</Link> : cn(v)}</div>;
    }
    const lvl = credLevel(me, v);
    const accSel = (role: "LEAD" | "MEMBER") => (
      <ActionForm action={setAccess} style={{ display: "contents" }}>
        <input type="hidden" name="id" value={v.id} /><input type="hidden" name="role" value={role} />
        <label><span>{role === "LEAD" ? "Leads" : "Members"}</span><AutoSubmit className="fsm" name="value" defaultValue={role === "LEAD" ? v.leadAccess : v.memberAccess} key={role === "LEAD" ? v.leadAccess : v.memberAccess} aria-label={`${role === "LEAD" ? "Leads" : "Members"} access`}>
          {Object.entries(ACCESS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </AutoSubmit></label>
      </ActionForm>
    );
    return (
      <div key={v.id} style={{ display: "contents" }}>
        {head}
        <div className={`cred ${admin ? "adm" : ""}`}>
          <div className="c-name"><b>{v.name}</b>{v.url ? <a className="xs" href={v.url} target="_blank" rel="noreferrer">{v.url.replace(/^https?:\/\//, "")}</a> : null}{v.notes ? <span className="xs muted">{v.notes}</span> : null}</div>
          <div className="c-user"><span className="cl">Username</span><span className="uval">{v.username}</span><CopyButton text={v.username} label="Copy username" /></div>
          <div className="c-pw"><span className="cl">Password</span>{lvl === "FULL" ? <SecretBox reveal={revealCredential.bind(null, v.id)} /> : <span className="xs muted">Not shared with you</span>}</div>
          {admin ? <div className="c-acc">{accSel("LEAD")}{accSel("MEMBER")}</div> : null}
          <div className="c-date xs muted"><span className="cl">Changed</span>{fmtDate(v.changedOn)}</div>
          {admin ? (
            <Modal title="Edit credentials" trigger={<Icon name="edit" />} triggerClass="iconbtn sm c-edit" triggerLabel={`Edit ${v.name}`}>
              <ActionForm action={editCredential} className="stack">
                <input type="hidden" name="id" value={v.id} />
                <CredFields edit clients={clientOpts} scope={tab} v={{ name: v.name, scope: v.scope, clientId: v.clientId, url: v.url, username: v.username, notes: v.notes, leadAccess: v.leadAccess, memberAccess: v.memberAccess }} />
                <div className="between"><div className="row"><button className="btn btn-p">Save</button><CancelButton /></div><ConfirmButton label="Delete" name="intent" value="delete" /></div>
              </ActionForm>
            </Modal>
          ) : null}
        </div>
      </div>
    );
  });

  return (
    <>
      <header className="between">
        <div><h1>Credentials</h1><p className="soft">{admin ? "Client and internal logins. Choose for each one what leads and members can see." : "Logins the admin has shared with you."}</p></div>
        {admin ? <Link className="btn btn-p" href={url({ add: !adding })}>{adding ? "Close" : "Add credentials"}</Link> : null}
      </header>
      {adding ? (
        <section className="panel pad stack"><h2>Add credentials</h2>
          <ActionForm action={addCredential} reset className="stack">
            <CredFields clients={clientOpts} scope={tab} clientId={f.client} />
            <div><button className="btn btn-p">Save</button></div>
          </ActionForm>
        </section>
      ) : null}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="seg" role="tablist" aria-label="Credential type">
          <Link role="tab" href={url({ tab: "CLIENT" })} aria-pressed={tab === "CLIENT"}>Client ({all.filter((v) => v.scope === "CLIENT").length})</Link>
          <Link role="tab" href={url({ tab: "INTERNAL" })} aria-pressed={tab === "INTERNAL"}>Internal ({all.filter((v) => v.scope === "INTERNAL").length})</Link>
        </div>
        {admin ? <span className="small muted">Hidden: not listed. Login only: sees the link and username. Full access: also sees the password.</span> : null}
      </div>
      <Form action="/credentials" className="panel pad row" style={{ alignItems: "flex-end" }}>
        {tab !== "CLIENT" ? <input type="hidden" name="tab" value={tab} /> : null}
        <div style={{ flex: 1, minWidth: 200 }}><label className="lbl" htmlFor="vf-q">Search</label><input className="field" id="vf-q" name="q" defaultValue={f.q} placeholder="Name, username or link, then press Enter" /></div>
        {tab === "CLIENT" ? (
          <div style={{ minWidth: 220 }}><label className="lbl" htmlFor="vf-c">Client</label>
            <AutoSubmit className="field" id="vf-c" name="client" defaultValue={f.client} key={f.client}><option value="">All clients</option>{clientFilter.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</AutoSubmit></div>
        ) : null}
      </Form>
      {list.length ? (
        <div className="panel credlist">
          <div className={`cred head ${admin ? "adm" : ""}`}><div>Login</div><div>Username</div><div>Password</div>{admin ? <div>Who can see</div> : null}<div>Changed</div>{admin ? <div /> : null}</div>
          {rows}
        </div>
      ) : <Empty>{admin ? "No credentials in this tab yet." : "No credentials have been shared with you here."}</Empty>}
      {admin ? (
        <section className="stack"><h2>Access log</h2>
          <ol className="panel pad feed">{log.length ? log.map((l) => <li key={l.id}><b>{l.user?.name || "Admin"}</b> {l.action} <span className="soft">{l.name}</span><time>{fmtStamp(stampOf(l.createdAt))}</time></li>) : <li className="muted">Every time a password is shown or copied it is logged here.</li>}</ol>
        </section>
      ) : null}
    </>
  );
}
