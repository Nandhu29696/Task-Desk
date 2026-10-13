"use client";

// Port of the preview's clientForm and svcRow: the multi service client form.
import { useContext, useRef, useState } from "react";
import { COMMS, INDUSTRIES, PRODUCT_LINES, RENEW_LINES, STAGE, STAGES, SVC, SVC_LINES } from "@/lib/constants";
import { ModalCtx } from "@/components/client/ActionForm";

export type SvcInit = { id: string; line: string; type: string; price: number | ""; cycle: string | null; startDate: string; completedDate: string; item: string; provider: string; renewDate: string };
export type ClientInit = {
  name: string; industry: string; stage: string; ownerId: string | null; services: SvcInit[]; renewal: string; city: string; gst: string; website: string; address: string;
  poc: { name: string; role: string; phone: string; email: string }; comms: string[]; notes: string;
};
type Row = SvcInit & { key: number };

const blank = (line = "SEO"): SvcInit => ({
  id: "", line, type: line === "WEBDEV" ? "ONE_TIME" : "RECURRING", price: "", cycle: RENEW_LINES.includes(line) ? "YEARLY" : "MONTHLY", startDate: "", completedDate: "", item: "", provider: "", renewDate: "",
});
const itemLabel = (line: string) => (line === "DOMAIN" ? "Domain name" : line === "HOSTING" ? "Hosting plan" : "Covers");

function SvcRow({ r, update, remove }: { r: Row; update: (patch: Partial<Row>) => void; remove: () => void }) {
  const renew = RENEW_LINES.includes(r.line);
  return (
    <div className="svrow" data-row data-line={r.line}>
      <input type="hidden" name="sv_id" value={r.id} />
      <div><label className="lbl">Service or product</label>
        <select className="field" name="sv_line" value={r.line} onChange={(e) => { const v = e.currentTarget.value; update({ line: v, ...(RENEW_LINES.includes(v) ? { cycle: "YEARLY" } : {}) }); }}>
          {SVC_LINES.map((x) => <option key={x} value={x}>{SVC[x]}</option>)}
        </select></div>
      <div><label className="lbl">Type</label>
        <select className="field" name="sv_type" value={r.type} onChange={(e) => update({ type: e.currentTarget.value })}>
          <option value="RECURRING">Recurring</option><option value="ONE_TIME">One time project</option>
        </select></div>
      <div><label className="lbl">Price (₹)</label><input className="field" type="number" min={0} step={500} name="sv_price" defaultValue={r.price} required /></div>
      <div hidden={r.type === "ONE_TIME"} data-cycle><label className="lbl">Billing</label>
        <select className="field" name="sv_cycle" value={r.cycle || "MONTHLY"} onChange={(e) => update({ cycle: e.currentTarget.value })}>
          <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="YEARLY">Yearly</option>
        </select></div>
      <div hidden={r.type !== "ONE_TIME"} data-cycle-ph><label className="lbl">Billing</label><p className="field" style={{ background: "var(--bg)", color: "var(--ink3)" }}>Once</p></div>
      <div><label className="lbl">Start date</label><input className="field" type="date" name="sv_start" defaultValue={r.startDate} /></div>
      <div><label className="lbl">Completed on</label><input className="field" type="date" name="sv_done" defaultValue={r.completedDate} /></div>
      <button type="button" className="x" onClick={remove} aria-label="Remove service" title="Remove" style={{ paddingBottom: 10 }}>&times;</button>
      <div className="svextra" hidden={!renew}>
        <div><label className="lbl">{itemLabel(r.line)}</label><input className="field" name="sv_item" defaultValue={r.item} placeholder="example.in or plan name" /></div>
        <div><label className="lbl">Provider</label><input className="field" name="sv_provider" defaultValue={r.provider} placeholder="GoDaddy, Hostinger" /></div>
        <div><label className="lbl">Renews or expires on</label><input className="field" type="date" name="sv_renew" defaultValue={r.renewDate} /></div>
        <p className="xs muted" style={{ alignSelf: "center" }}>The account manager gets a reminder 30 days before this date.</p>
      </div>
    </div>
  );
}

export function ClientFields({ client, users, meId }: { client?: ClientInit | null; users: [string, string][]; meId: string }) {
  const v: ClientInit = client || { name: "", industry: "Other", stage: "LEAD", ownerId: meId, services: [], renewal: "", city: "", gst: "", website: "", address: "", poc: { name: "", role: "", phone: "", email: "" }, comms: [], notes: "" };
  const seq = useRef(0);
  const [rows, setRows] = useState<Row[]>(() => v.services.map((s) => ({ ...s, key: seq.current++ })));
  const lines = new Set(rows.map((r) => r.line));
  const add = (line?: string) => setRows((rs) => [...rs, { ...blank(line), key: seq.current++ }]);
  const pick = (line: string, on: boolean) => (on ? add(line) : setRows((rs) => rs.filter((r) => r.line !== line)));
  const pickBox = (x: string) => <label key={x} className="check"><input type="checkbox" value={x} checked={lines.has(x)} onChange={(e) => pick(x, e.currentTarget.checked)} />{SVC[x]}</label>;
  return (
    <>
      <div className="grid2">
        <div><label className="lbl">Client name</label><input className="field" name="name" defaultValue={v.name} required /></div>
        <div><label className="lbl">Industry</label><select className="field" name="industry" defaultValue={v.industry || "Other"}>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
        <div><label className="lbl">Stage</label><select className="field" name="stage" defaultValue={v.stage}>{STAGES.map((s) => <option key={s} value={s}>{STAGE[s]}</option>)}</select></div>
        <div><label className="lbl">Account manager</label><select className="field" name="ownerId" defaultValue={v.ownerId || meId}>{users.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <legend className="lbl">Services we provide. Tick a service to add its price; use Add another line when one service has both a one time project and a recurring plan.</legend>
        <div className="row" style={{ gap: "6px 16px" }}><span className="xs muted" style={{ width: 64 }}>Services</span>{SVC_LINES.filter((x) => !PRODUCT_LINES.includes(x)).map(pickBox)}</div>
        <div className="row" style={{ gap: "6px 16px" }}><span className="xs muted" style={{ width: 64 }}>Products</span>{PRODUCT_LINES.map(pickBox)}</div>
        <div className="rowlist svlist">
          {rows.map((r) => <SvcRow key={r.key} r={r} update={(patch) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, ...patch } : x)))} remove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />)}
        </div>
        <div><button type="button" className="btn btn-q btn-sm" onClick={() => add()}>Add another line</button></div>
      </fieldset>
      <div className="grid4">
        <div><label className="lbl">Renewal date</label><input className="field" type="date" name="renewal" defaultValue={v.renewal} /></div>
        <div><label className="lbl">City</label><input className="field" name="city" defaultValue={v.city} /></div>
        <div><label className="lbl">GST number</label><input className="field" name="gst" defaultValue={v.gst} /></div>
        <div><label className="lbl">Website</label><input className="field" type="url" name="website" defaultValue={v.website} /></div>
      </div>
      <div><label className="lbl">Address</label><input className="field" name="address" defaultValue={v.address} /></div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack"><legend className="lbl">Point of contact</legend>
        <div className="grid4">
          <div><label className="lbl">Name</label><input className="field" name="poc_name" defaultValue={v.poc.name} required /></div>
          <div><label className="lbl">Position</label><input className="field" name="poc_role" defaultValue={v.poc.role} /></div>
          <div><label className="lbl">Phone</label><input className="field" name="poc_phone" defaultValue={v.poc.phone} /></div>
          <div><label className="lbl">Email</label><input className="field" type="email" name="poc_email" defaultValue={v.poc.email} /></div>
        </div>
        <div><span className="lbl">Preferred way to communicate</span><CommsBoxes name="comms" selected={v.comms} /></div>
      </fieldset>
      <div><label className="lbl">Notes</label><textarea className="field" name="notes" rows={3} defaultValue={v.notes} /></div>
    </>
  );
}

export function CommsBoxes({ name, selected }: { name: string; selected: string[] }) {
  return <div className="row" style={{ gap: "6px 16px" }}>{Object.entries(COMMS).map(([k, l]) => <label key={k} className="check"><input type="checkbox" name={name} value={k} defaultChecked={selected.includes(k)} />{l}</label>)}</div>;
}

/** Closes the surrounding Modal (the Cancel button in edit popups). */
export function CancelButton({ label = "Cancel" }: { label?: string }) {
  const m = useContext(ModalCtx);
  return <button type="button" className="btn btn-q" onClick={() => m?.close()}>{label}</button>;
}
