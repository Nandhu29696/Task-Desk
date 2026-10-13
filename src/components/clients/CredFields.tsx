"use client";

// Port of the preview's credForm with the Generate password button.
import { useRef } from "react";
import { ACCESS } from "@/lib/constants";
import { toast } from "@/components/client/ActionForm";

function genPassword(n = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?";
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => chars[x % chars.length]).join("");
}

export type CredInit = { name: string; scope: string; clientId: string | null; url: string; username: string; notes: string; leadAccess: string; memberAccess: string };

export function CredFields({ v, clients, scope, clientId, edit = false }: { v?: CredInit | null; clients: [string, string][]; scope: string; clientId?: string; edit?: boolean }) {
  const pw = useRef<HTMLInputElement>(null);
  const acc = Object.entries(ACCESS);
  return (
    <>
      <div className="grid2">
        <div><label className="lbl">Name</label><input className="field" name="name" defaultValue={v?.name || ""} required placeholder="Client WordPress admin" /></div>
        <div><label className="lbl">Type</label><select className="field" name="scope" defaultValue={v?.scope || scope}><option value="CLIENT">Client</option><option value="INTERNAL">Internal</option></select></div>
        <div><label className="lbl">Client (for client credentials)</label>
          <select className="field" name="clientId" defaultValue={v ? v.clientId || "" : clientId || ""}><option value="">None</option>{clients.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
        <div><label className="lbl">Login link</label><input className="field" name="url" type="url" defaultValue={v?.url || ""} placeholder="https://" /></div>
        <div><label className="lbl">Username, email or mobile number</label><input className="field" name="username" defaultValue={v?.username || ""} required autoComplete="off" /></div>
        <div><label className="lbl">Password</label>
          <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
            <input ref={pw} className="field" name="password" required={!edit} autoComplete="off" placeholder={edit ? "Leave empty to keep the current password" : undefined} style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace" }} />
            <button type="button" className="btn btn-q btn-sm" onClick={() => { if (pw.current) pw.current.value = genPassword(); toast("Strong password generated. Save to keep it"); }}>Generate</button>
          </div></div>
        <div><label className="lbl">Leads can see</label><select className="field" name="acc_LEAD" defaultValue={v?.leadAccess || "NONE"}>{acc.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="lbl">Members can see</label><select className="field" name="acc_MEMBER" defaultValue={v?.memberAccess || "NONE"}>{acc.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      <div><label className="lbl">Notes</label><input className="field" name="notes" defaultValue={v?.notes || ""} placeholder="Two factor goes to the office phone" /></div>
    </>
  );
}
