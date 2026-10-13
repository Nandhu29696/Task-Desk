import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { fmtDate } from "@/lib/dates";
import { isAdmin } from "@/lib/permissions";
import { ackPolicy, addPolicy, removePolicy, savePolicy } from "@/app/actions/office";
import { ActionForm } from "@/components/client/ActionForm";
import { ConfirmButton, Modal } from "@/components/client/Widgets";
import { Av, Empty } from "@/components/ui";
import { PolicyBody } from "@/components/office/PolicyBody";
import { ModalCancel } from "@/components/people/client";

const HINT = "Start a line with ## for a heading and with a dash and space for a bullet point. Leave a blank line between paragraphs.";

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const u = ctx.me, adm = isAdmin(u);
  const rows = await prisma.policy.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }], include: { acks: { select: { userId: true, ackedOn: true } } } });
  const ackOf = (p: (typeof rows)[number], id: string) => p.acks.find((a) => a.userId === id)?.ackedOn;
  const policies = [...rows].sort((a, b) => Number(!!ackOf(a, u.id)) - Number(!!ackOf(b, u.id)));
  const pol = policies.find((x) => x.id === sp.id) || policies.find((x) => !ackOf(x, u.id)) || policies[0];
  const everyone = ctx.active;
  const myAck = pol ? ackOf(pol, u.id) : undefined;

  return (
    <>
      <header className="between">
        <div><h1>Policies</h1><p className="soft">Company policies everyone should read. Tick to confirm you have read the latest version.</p></div>
        {adm ? (
          <Modal title="Add a policy" trigger="Add a policy" triggerClass="btn btn-q" wide>
            <ActionForm action={addPolicy} reset className="stack">
              <div><label className="lbl" htmlFor="np-t">Title</label><input className="field" id="np-t" name="title" required placeholder="New policy" /></div>
              <div><label className="lbl" htmlFor="np-b">Policy text</label><textarea className="field" id="np-b" name="body" rows={16} required style={{ fontSize: 14, lineHeight: 1.6 }} placeholder="Write the policy here." />
                <p className="xs muted" style={{ marginTop: 4 }}>{HINT}</p></div>
              <p className="xs muted">Everyone is asked to read a new policy.</p>
              <div className="row"><button className="btn btn-p">Add policy</button><ModalCancel /></div>
            </ActionForm>
          </Modal>
        ) : null}
      </header>
      <div className="polgrid">
        <nav className="panel pad stack" aria-label="Policies" style={{ gap: 4 }}>
          {policies.map((x) => (
            <Link key={x.id} className="polnav" href={`/policies?id=${x.id}`} aria-current={pol && x.id === pol.id ? "page" : "false"}>
              <span>{x.title}</span>{ackOf(x, u.id) ? <span className="xs t-moss">Read</span> : <span className="xs t-ochre">To read</span>}
            </Link>
          ))}
        </nav>
        {pol ? (
          <article className="panel pad stack-lg policy">
            <div className="between">
              <div><h2 style={{ fontSize: 24 }}>{pol.title}</h2><p className="small muted">Updated {fmtDate(pol.updatedOn)} by {ctx.user(pol.updatedById)?.name || "Admin"}</p></div>
              {adm ? (
                <Modal title={"Edit " + pol.title} trigger="Edit" triggerClass="btn btn-q btn-sm" wide>
                  <ActionForm action={savePolicy} className="stack">
                    <input type="hidden" name="id" value={pol.id} />
                    <div><label className="lbl" htmlFor="pol-t">Title</label><input className="field" id="pol-t" name="title" defaultValue={pol.title} required /></div>
                    <div><label className="lbl" htmlFor="pol-b">Policy text</label><textarea className="field" id="pol-b" name="body" rows={22} defaultValue={pol.body} style={{ fontSize: 14, lineHeight: 1.6 }} />
                      <p className="xs muted" style={{ marginTop: 4 }}>{HINT}</p></div>
                    <label className="check"><input type="checkbox" name="reset" defaultChecked />Ask everyone to read it again after saving</label>
                    <div className="row"><button className="btn btn-p">Save policy</button><ModalCancel /></div>
                  </ActionForm>
                  {policies.length > 1 ? (
                    <ActionForm action={removePolicy} className="row" style={{ borderTop: "1px solid var(--line2)", paddingTop: 12 }}>
                      <input type="hidden" name="id" value={pol.id} /><ConfirmButton label="Delete policy" />
                    </ActionForm>
                  ) : null}
                </Modal>
              ) : null}
            </div>
            <PolicyBody body={pol.body} />
            <div className={`banner ${myAck ? "" : "warn"}`}>
              {myAck ? <span>You confirmed reading this on {fmtDate(myAck)}.</span> : <>
                <span>Please read this policy and confirm.</span><span className="grow" />
                <ActionForm action={ackPolicy} style={{ display: "contents" }}><input type="hidden" name="id" value={pol.id} /><button className="btn btn-p btn-sm">I have read this policy</button></ActionForm>
              </>}
            </div>
            {adm ? (
              <section className="stack">
                <h3>Read by {everyone.filter((x) => ackOf(pol, x.id)).length} of {everyone.length}</h3>
                <div className="row small" style={{ gap: "6px 14px" }}>
                  {everyone.map((x) => <span key={x.id} className="person"><Av name={x.name} size={20} />{x.name.split(" ")[0]} {ackOf(pol, x.id) ? <span className="t-moss xs">read</span> : <span className="t-ochre xs">pending</span>}</span>)}
                </div>
              </section>
            ) : null}
          </article>
        ) : <Empty>No policies yet.</Empty>}
      </div>
    </>
  );
}
