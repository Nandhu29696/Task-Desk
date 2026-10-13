import Link from "next/link";
import { getCtx } from "@/lib/context";
import { EMPTYPE, ROLE } from "@/lib/constants";
import { changePassword } from "@/app/actions/auth";
import { Av } from "@/components/ui";
import { ChangePasswordForm } from "@/components/people/client";

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const u = ctx.me;
  const first = sp.first === "1" || u.mustChangePassword;

  return (
    <>
      <header><h1>My account</h1><p className="soft">Your sign in details and password.</p></header>
      {first ? <div className="banner warn"><span>Welcome to TaskDesk. Please set a new password of your own before you continue.</span></div> : null}
      <div className="grid2" style={{ alignItems: "start" }}>
        <section className="panel pad stack"><h2>Change password</h2>
          <ChangePasswordForm action={changePassword} first={first}>
            <div><label className="lbl" htmlFor="pw-c">{first ? "Temporary password" : "Current password"}</label><input className="field" id="pw-c" name="current" type="password" required autoComplete="current-password" /></div>
            <div><label className="lbl" htmlFor="pw-n">New password</label><input className="field" id="pw-n" name="next" type="password" required minLength={8} autoComplete="new-password" /></div>
            <div><label className="lbl" htmlFor="pw-a">New password again</label><input className="field" id="pw-a" name="again" type="password" required minLength={8} autoComplete="new-password" /></div>
            <p className="xs muted">Use at least 8 characters. Do not reuse a password from another site.</p>
            <div><button className="btn btn-p">Change password</button></div>
          </ChangePasswordForm>
        </section>
        <section className="panel pad stack">
          <div className="row" style={{ flexWrap: "nowrap" }}><Av name={u.name} size={44} /><div><b style={{ display: "block" }}>{u.name}</b><span className="soft small">{u.title || ROLE[u.role]}</span></div></div>
          <dl className="kv">
            <dt>Email</dt><dd style={{ wordBreak: "break-all" }}>{u.email}</dd>
            <dt>Access</dt><dd>{ROLE[u.role]}</dd>
            <dt>Type</dt><dd>{EMPTYPE[u.emp] || ""}</dd>
            <dt>Phone</dt><dd>{u.phone || "Not added"}</dd>
            <dt>Location</dt><dd>{u.location || "Not added"}</dd>
          </dl>
          <div className="row"><Link className="btn btn-q btn-sm" href={`/people/${u.id}`}>My profile</Link><Link className="btn btn-q btn-sm" href="/people?edit=me">Edit my details</Link></div>
        </section>
      </div>
    </>
  );
}
