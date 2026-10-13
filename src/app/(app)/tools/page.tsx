import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { TOOLCATS } from "@/lib/constants";
import { canSeeToolPassword, isAdmin } from "@/lib/permissions";
import { addTool, editTool, removeTool, revealToolPassword } from "@/app/actions/office";
import { ActionForm, AutoSubmit } from "@/components/client/ActionForm";
import { ConfirmButton, CopyButton, Modal, SecretBox } from "@/components/client/Widgets";
import { Icon } from "@/components/Icon";
import { Empty, Options } from "@/components/ui";
import { PWVIS } from "@/components/office/shared";
import { GenPasswordField, ModalCancel } from "@/components/people/client";

type ToolRow = { id: string; name: string; category: string; url: string; username: string; twofa: string; plan: string; visibility: string; notes: string; hasPw: boolean };

function ToolFields({ t }: { t?: ToolRow }) {
  return (
    <>
      <div className="grid2">
        <div><label className="lbl">Name</label><input className="field" name="name" defaultValue={t?.name || ""} required /></div>
        <div><label className="lbl">Category</label><select className="field" name="category" defaultValue={t?.category || "SEO"}><Options opts={TOOLCATS.map((c): [string, string] => [c, c])} /></select></div>
        <div><label className="lbl">Login link</label><input className="field" name="url" type="url" defaultValue={t?.url || ""} placeholder="https://" /></div>
        <div><label className="lbl">Login (username, email or mobile number)</label><input className="field" name="login" defaultValue={t?.username || ""} autoComplete="off" /></div>
        <div><label className="lbl">Password</label><GenPasswordField placeholder={t?.hasPw ? "Leave empty to keep the saved password" : "Leave empty if everyone uses their own login"} />
          {t?.hasPw ? <label className="check xs" style={{ marginTop: 4 }}><input type="checkbox" name="clearpw" />Remove the saved password</label> : null}</div>
        <div><label className="lbl">Two factor details (if enabled)</label><input className="field" name="twofa" defaultValue={t?.twofa || ""} placeholder="Code goes to the office phone" /></div>
        <div><label className="lbl">Free or paid</label><select className="field" name="plan" defaultValue={t?.plan || "FREE"}><Options opts={[["FREE", "Free"], ["PAID", "Paid"]]} /></select></div>
        <div><label className="lbl">Who can see the password</label><select className="field" name="vis" defaultValue={t?.visibility || "ALL"}><Options opts={Object.entries(PWVIS)} /></select></div>
      </div>
      <div><label className="lbl">Notes</label><input className="field" name="notes" defaultValue={t?.notes || ""} /></div>
    </>
  );
}

export default async function ToolsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const u = ctx.me, adm = isAdmin(u);
  const f = { q: (sp.q || "").trim(), cat: TOOLCATS.includes(sp.cat || "") ? sp.cat! : "" };
  const adding = adm && sp.add === "1";
  const rows = await prisma.tool.findMany({ select: { id: true, name: true, category: true, url: true, username: true, twofa: true, plan: true, visibility: true, notes: true, passwordEnc: true } });
  const tools: ToolRow[] = rows.map(({ passwordEnc, ...t }) => ({ ...t, hasPw: !!passwordEnc }));
  const list = tools
    .filter((t) => (!f.cat || t.category === f.cat) && (!f.q || (t.name + " " + t.username + " " + t.notes).toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => TOOLCATS.indexOf(a.category) - TOOLCATS.indexOf(b.category) || a.name.localeCompare(b.name));
  const cats = TOOLCATS.filter((c) => list.some((t) => t.category === c));
  const keep = (extra: Record<string, string>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ q: f.q, cat: f.cat, ...extra })) if (v) p.set(k, v); const s = p.toString(); return "/tools" + (s ? "?" + s : ""); };

  const pwCell = (t: ToolRow) => {
    if (!t.hasPw) return <span className="xs muted">Own login</span>;
    if (!canSeeToolPassword(u, t)) return <span className="xs muted">Ask the admin</span>;
    return <SecretBox reveal={revealToolPassword.bind(null, t.id)} />;
  };

  return (
    <>
      <header className="between">
        <div><h1>Tools</h1><p className="soft">Every tool the team uses, with the login link and how to sign in.</p></div>
        {adm ? <Link className="btn btn-q" href={adding ? keep({}) : keep({ add: "1" })}>{adding ? "Close" : "Add a tool"}</Link> : null}
      </header>
      {adding ? (
        <section className="panel pad stack"><h2>Add a tool</h2>
          <ActionForm action={addTool} reset className="stack"><ToolFields /><div><button className="btn btn-p">Add tool</button></div></ActionForm>
        </section>
      ) : null}
      <Form action="/tools" className="panel pad row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 200 }}><label className="lbl" htmlFor="tl-q">Search</label><input className="field" id="tl-q" name="q" defaultValue={f.q} placeholder="Tool, login or notes, then press Enter" /></div>
        <div style={{ minWidth: 200 }}><label className="lbl" htmlFor="tl-c">Category</label><AutoSubmit className="field" id="tl-c" name="cat" defaultValue={f.cat}><Options opts={[["", "All categories"], ...TOOLCATS.map((c): [string, string] => [c, c])]} /></AutoSubmit></div>
      </Form>
      {cats.length ? cats.map((c) => (
        <section key={c} className="stack"><h2>{c}</h2>
          <div className="panel tablebox"><table className="t" style={{ minWidth: 860 }}>
            <thead><tr><th>Tool</th><th>Login</th><th>Password</th><th>Two factor</th><th>Plan</th><th>Notes</th>{adm ? <th></th> : null}</tr></thead>
            <tbody>
              {list.filter((t) => t.category === c).map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{t.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{t.name}</a> : <b>{t.name}</b>}</td>
                  <td className="small"><div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><span style={{ wordBreak: "break-all" }}>{t.username}</span>{t.username && /[@\d]/.test(t.username) && !/^Your /.test(t.username) ? <CopyButton text={t.username} label="Copy login" /> : null}</div></td>
                  <td>{pwCell(t)}</td>
                  <td className="small soft" style={{ maxWidth: 200 }}>{t.twofa || "Not enabled"}</td>
                  <td><span className={`chip ${t.plan === "PAID" ? "plan-paid" : "plan-free"}`}>{t.plan === "PAID" ? "Paid" : "Free"}</span></td>
                  <td className="small soft" style={{ maxWidth: 240 }}>{t.notes}</td>
                  {adm ? (
                    <td className="r">
                      <Modal title={"Edit " + t.name} trigger={<Icon name="edit" />} triggerClass="iconbtn sm" triggerLabel={`Edit ${t.name}`} wide>
                        <ActionForm action={editTool} className="stack">
                          <input type="hidden" name="id" value={t.id} />
                          <ToolFields t={t} />
                          <div className="row"><button className="btn btn-p">Save</button><ModalCancel /></div>
                        </ActionForm>
                        <ActionForm action={removeTool} className="row" style={{ borderTop: "1px solid var(--line2)", paddingTop: 12 }}>
                          <input type="hidden" name="id" value={t.id} /><ConfirmButton label="Remove tool" />
                        </ActionForm>
                      </Modal>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )) : <Empty>No tools match.</Empty>}
    </>
  );
}
