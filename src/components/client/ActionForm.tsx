"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type Result = { ok?: string; error?: string; at?: number; data?: Record<string, unknown> } | undefined;
type Action = (prev: Result, fd: FormData) => Promise<Result>;

/** Shows a short message at the bottom of the screen. */
export function toast(msg: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("td:toast", { detail: msg }));
}

/** Lets a Modal close itself when the form inside it succeeds. */
export const ModalCtx = createContext<{ close: () => void } | null>(null);

/**
 * A form that posts to a server action and shows its ok or error message as a toast.
 * On success: optional reset, closes the surrounding Modal, optional redirect to data.href.
 */
export function ActionForm({ action, children, reset = false, quiet = false, onOk, ...rest }: { action: Action; children: ReactNode; reset?: boolean; quiet?: boolean; onOk?: (r: Result) => void } & Omit<ComponentProps<"form">, "action" | "onSubmit">) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const modal = useContext(ModalCtx);
  const router = useRouter();
  const seen = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state || state.at === seen.current) return;
    seen.current = state.at;
    if (state.error) { toast(state.error); return; }
    if (state.ok && !quiet) toast(state.ok);
    if (reset) ref.current?.reset();
    onOk?.(state);
    modal?.close();
    const href = state.data?.href;
    if (typeof href === "string") router.push(href);
  }, [state, reset, quiet, onOk, modal, router]);
  // Keep the clicked button's name and value (for example Approve or Reject): copy it into a hidden field before submit.
  const keepSubmitter = (e: React.MouseEvent<HTMLFormElement>) => {
    const b = (e.target as HTMLElement).closest("button[name]") as HTMLButtonElement | null;
    if (!b || (b.type && b.type !== "submit") || !ref.current) return;
    let h = ref.current.querySelector<HTMLInputElement>(`input[type=hidden][data-submitter="${b.name}"]`);
    if (!h) { h = document.createElement("input"); h.type = "hidden"; h.name = b.name; h.dataset.submitter = b.name; ref.current.appendChild(h); }
    h.value = b.value;
  };
  return <form ref={ref} action={formAction} onClickCapture={keepSubmitter} {...rest}>{children}</form>;
}

/** Submits its form as soon as the value changes (status pickers, plan slots, filters). */
export function AutoSubmit({ children, ...rest }: ComponentProps<"select">) {
  return <select {...rest} onChange={(e) => { if (e.currentTarget.value !== "" || !rest.required) e.currentTarget.form?.requestSubmit(); }}>{children}</select>;
}

/** Checkbox that submits its form on change. */
export function AutoCheck(props: ComponentProps<"input">) {
  return <input type="checkbox" {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function Toaster() {
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const h = (e: Event) => { setMsg((e as CustomEvent<string>).detail); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(""), 2800); };
    window.addEventListener("td:toast", h);
    return () => window.removeEventListener("td:toast", h);
  }, []);
  return <div className="toast" role="status" aria-live="polite" hidden={!msg}>{msg}</div>;
}
