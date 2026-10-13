"use client";
// Small client helpers for the projects and reports pages.
import { useContext, type ComponentProps } from "react";
import { ModalCtx } from "../client/ActionForm";

/** Cancel button inside a Modal: closes the popup. */
export function ModalCancel({ label = "Cancel" }: { label?: string }) {
  const m = useContext(ModalCtx);
  return <button type="button" className="btn btn-q" onClick={() => m?.close()}>{label}</button>;
}

/** Input (for example a date) that submits its form as soon as the value changes. */
export function AutoInput(props: ComponentProps<"input">) {
  return <input {...props} onChange={(e) => { if (e.currentTarget.value) e.currentTarget.form?.requestSubmit(); }} />;
}
