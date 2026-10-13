"use client";

import { useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, ModalCtx, type Result } from "@/components/client/ActionForm";
import { CopyButton } from "@/components/client/Widgets";

/** Cancel button inside a Modal: closes the popup. */
export function ModalCancel({ label = "Cancel" }: { label?: string }) {
  const m = useContext(ModalCtx);
  return <button type="button" className="btn btn-q" onClick={() => m?.close()}>{label}</button>;
}

/** Temporary password input with a copy button that copies what is in the field now. */
export function TempPasswordField({ id, initial }: { id: string; initial: string }) {
  const [v, setV] = useState(initial);
  return (
    <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
      <input className="field" id={id} name="password" minLength={8} required value={v} onChange={(e) => setV(e.currentTarget.value)} style={{ fontFamily: "var(--f-mono, monospace)" }} autoComplete="off" />
      <CopyButton text={v} label="Copy password" className="iconbtn" />
    </div>
  );
}

function genPassword(n = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?";
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => chars[x % chars.length]).join("");
}

/** Password input with a Generate button (tool forms). */
export function GenPasswordField({ placeholder }: { placeholder?: string }) {
  const [v, setV] = useState("");
  return (
    <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
      <input className="field" name="password" value={v} onChange={(e) => setV(e.currentTarget.value)} autoComplete="off" placeholder={placeholder} style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace" }} />
      <button type="button" className="btn btn-q btn-sm" onClick={() => setV(genPassword())}>Generate</button>
    </div>
  );
}

/** Change password form: after the first sign in it goes on to the dashboard. */
export function ChangePasswordForm({ action, first, children }: { action: (p: Result, fd: FormData) => Promise<Result>; first: boolean; children: ReactNode }) {
  const router = useRouter();
  return <ActionForm action={action} reset className="stack" onOk={() => { if (first) router.push("/"); }}>{children}</ActionForm>;
}
