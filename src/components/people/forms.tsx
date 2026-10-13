// Add person and edit person popups, shared by People, Team and the profile page.
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { EMPTYPE, ROLE } from "@/lib/constants";
import { addableRoles, canAddPeople, isAdmin } from "@/lib/permissions";
import type { U } from "@/lib/model";
import { addPerson, editPerson, resetPassword } from "@/app/actions/people";
import { ActionForm } from "@/components/client/ActionForm";
import { Modal } from "@/components/client/Widgets";
import { Icon } from "@/components/Icon";
import { Options } from "@/components/ui";
import { tempPassword } from "@/components/office/shared";
import { ModalCancel, TempPasswordField } from "./client";

const sunk = { background: "var(--sunk)" };

/** "Add lead or member" (admin) or "Add member" (lead) button with its popup. Renders nothing for members. */
export async function AddPersonModal({ ctx }: { ctx: Ctx }) {
  const u = ctx.me;
  if (!canAddPeople(u)) return null;
  const adm = isAdmin(u), roles = addableRoles(u);
  const projs = await prisma.project.findMany({ where: { status: { not: "ARCHIVED" }, ...(adm ? {} : { leadId: u.id }) }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const bosses = ctx.active.filter((x) => x.role !== "MEMBER");
  return (
    <Modal title={adm ? "Add a lead or member" : "Add a member to your team"} trigger={<><Icon name="plus" /> {adm ? "Add lead or member" : "Add member"}</>} triggerClass="btn btn-p" wide>
      <ActionForm action={addPerson} reset className="stack">
        <div className="grid2">
          <div><label className="lbl" htmlFor="au-n">Full name</label><input className="field" id="au-n" name="name" required placeholder="Lakshmi Narayanan" /></div>
          <div><label className="lbl" htmlFor="au-t">Position</label><input className="field" id="au-t" name="title" placeholder="SEO Executive" /></div>
          <div><label className="lbl" htmlFor="au-e">Work email (used to sign in)</label><input className="field" id="au-e" name="email" type="email" required placeholder="name@searchengineers.in" /></div>
          <div><label className="lbl" htmlFor="au-ph">Contact number</label><input className="field" id="au-ph" name="phone" placeholder="+91 98765 43210" /></div>
          <div><label className="lbl" htmlFor="au-l">Location</label><input className="field" id="au-l" name="location" placeholder="Coimbatore" /></div>
          <div><label className="lbl" htmlFor="au-y">Type</label><select className="field" id="au-y" name="emp" defaultValue="ON_ROLE"><Options opts={Object.entries(EMPTYPE)} /></select></div>
          <div><label className="lbl" htmlFor="au-r">TaskDesk access</label>
            {roles.length > 1
              ? <select className="field" id="au-r" name="role" defaultValue="MEMBER"><Options opts={roles.map((r) => [r, ROLE[r]])} /></select>
              : <><input type="hidden" name="role" value="MEMBER" /><div className="field" style={sunk}>Member</div></>}
          </div>
          <div><label className="lbl" htmlFor="au-b">Reports to</label>
            {adm
              ? <select className="field" id="au-b" name="reportsTo" defaultValue={u.id}><Options opts={bosses.map((x) => [x.id, `${x.name}, ${ROLE[x.role]}`])} /></select>
              : <><input type="hidden" name="reportsTo" value={u.id} /><div className="field" style={sunk}>{u.name} (you)</div></>}
          </div>
        </div>
        {projs.length ? <div><span className="lbl">Add to projects (optional)</span><div className="checks">{projs.map((p) => <label key={p.id} className="check"><input type="checkbox" name="projects" value={p.id} />{p.name}</label>)}</div></div> : null}
        <div><label className="lbl" htmlFor="au-p">Temporary password</label><TempPasswordField id="au-p" initial={tempPassword()} /><p className="xs muted" style={{ marginTop: 4 }}>Share it privately. They will be asked to change it after the first sign in.</p></div>
        <p className="xs muted">{adm ? "Lead: creates projects and recurring tasks for projects they lead, adds members, sees team reports and attendance. Member: works their tasks and requests leave." : "Members work their tasks and request leave. The admin is told when you add someone and can change their access later."}</p>
        <div className="row"><button className="btn btn-p">{adm ? "Add person" : "Add member"}</button><ModalCancel /></div>
      </ActionForm>
    </Modal>
  );
}

/** Edit details (and access for the admin) plus password reset. Only render when canEditPerson. */
export function EditPersonModal({ x, ctx, label, triggerClass = "btn btn-q btn-sm" }: { x: U; ctx: Ctx; label: string; triggerClass?: string }) {
  const adm = isAdmin(ctx.me);
  const bosses = ctx.active.filter((b) => b.role !== "MEMBER" && b.id !== x.id);
  return (
    <Modal title={"Edit " + x.name} trigger={<><Icon name="edit" /> {label}</>} triggerClass={triggerClass} wide>
      <ActionForm action={editPerson} className="stack">
        <input type="hidden" name="id" value={x.id} />
        <div className="grid2">
          <div><label className="lbl" htmlFor={`eu-n-${x.id}`}>Full name</label><input className="field" id={`eu-n-${x.id}`} name="name" defaultValue={x.name} required /></div>
          <div><label className="lbl" htmlFor={`eu-t-${x.id}`}>Position</label><input className="field" id={`eu-t-${x.id}`} name="title" defaultValue={x.title} /></div>
          <div><label className="lbl" htmlFor={`eu-ph-${x.id}`}>Contact number</label><input className="field" id={`eu-ph-${x.id}`} name="phone" defaultValue={x.phone} /></div>
          <div><label className="lbl" htmlFor={`eu-l-${x.id}`}>Location</label><input className="field" id={`eu-l-${x.id}`} name="location" defaultValue={x.location} /></div>
          <div><label className="lbl" htmlFor={`eu-y-${x.id}`}>Type</label><select className="field" id={`eu-y-${x.id}`} name="emp" defaultValue={x.emp}><Options opts={Object.entries(EMPTYPE)} /></select></div>
          {adm ? <>
            <div><label className="lbl" htmlFor={`eu-r-${x.id}`}>TaskDesk access</label><select className="field" id={`eu-r-${x.id}`} name="role" defaultValue={x.role}><Options opts={Object.entries(ROLE)} /></select></div>
            <div><label className="lbl" htmlFor={`eu-b-${x.id}`}>Reports to</label><select className="field" id={`eu-b-${x.id}`} name="reportsTo" defaultValue={x.reportsTo || ""}><Options opts={[["", "No one"], ...bosses.map((b): [string, string] => [b.id, `${b.name}, ${ROLE[b.role]}`])]} /></select></div>
          </> : null}
        </div>
        {adm ? <label className="check"><input type="checkbox" name="active" defaultChecked={x.active} />Active (can sign in)</label> : <p className="xs muted">Only the admin can change access or deactivate someone.</p>}
        <div className="row"><button className="btn btn-p">Save</button><ModalCancel /></div>
      </ActionForm>
      <ActionForm action={resetPassword} reset className="stack" style={{ gap: 6, borderTop: "1px solid var(--line2)", paddingTop: 14 }}>
        <input type="hidden" name="id" value={x.id} />
        <label className="lbl" htmlFor={`eu-p-${x.id}`}>Reset password</label>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><input className="field" id={`eu-p-${x.id}`} name="password" minLength={8} required placeholder="New temporary password" style={{ minWidth: 0 }} autoComplete="off" /><button className="btn btn-q">Reset</button></div>
      </ActionForm>
    </Modal>
  );
}
