"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ModalCtx, toast } from "./ActionForm";
import { Icon } from "../Icon";

/**
 * A popup. `trigger` is the button content; children are usually an ActionForm,
 * which closes the popup when it succeeds. Escape or the backdrop closes it too.
 */
export function Modal({ title, trigger, triggerClass = "btn btn-q", triggerLabel, children, open: openProp = false, wide = false }: { title: string; trigger: ReactNode; triggerClass?: string; triggerLabel?: string; children: ReactNode; open?: boolean; wide?: boolean }) {
  const [open, setOpen] = useState(openProp);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    const first = box.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
    first?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => setOpen(true)} aria-label={triggerLabel} title={triggerLabel}>{trigger}</button>
      {open && (
        <ModalCtx.Provider value={{ close: () => setOpen(false) }}>
          <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div className="modal panel" role="dialog" aria-modal="true" aria-label={title} ref={box} style={wide ? { width: "min(880px, 100%)" } : undefined}>
              <div className="between" style={{ alignItems: "center" }}><h2>{title}</h2><button type="button" className="x" onClick={() => setOpen(false)} aria-label="Close">&times;</button></div>
              {children}
            </div>
          </div>
        </ModalCtx.Provider>
      )}
    </>
  );
}

/** A destructive submit button that needs two clicks. */
export function ConfirmButton({ label, className = "btn btn-d btn-sm", name, value }: { label: string; className?: string; name?: string; value?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  if (!armed) return <button type="button" className={className} onClick={() => setArmed(true)}>{label}</button>;
  return <button type="submit" className="btn btn-arm btn-sm" name={name} value={value}>Click again to confirm</button>;
}

export function CopyButton({ text, label = "Copy", className = "iconbtn sm" }: { text: string; label?: string; className?: string }) {
  return (
    <button type="button" className={className} title={label} aria-label={label} onClick={async () => {
      try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Could not copy. Select and copy it by hand."); }
    }}><Icon name="copy" /></button>
  );
}

/**
 * Password cell: the password is never sent with the page. The eye and copy icons call
 * a server action that checks access, logs the view and returns the password.
 */
export function SecretBox({ reveal }: { reveal: () => Promise<{ value?: string; error?: string }> }) {
  const [value, setValue] = useState<string | null>(null);
  const get = async () => { const r = await reveal(); if (r.error) { toast(r.error); return null; } return r.value ?? ""; };
  return (
    <div className="pwbox">
      <code className="pw">{value ?? "•".repeat(10)}</code>
      <button type="button" className="iconbtn sm" title={value ? "Hide password" : "Show password"} aria-label={value ? "Hide password" : "Show password"} onClick={async () => { if (value !== null) { setValue(null); return; } const v = await get(); if (v !== null) setValue(v); }}><Icon name={value ? "eyeoff" : "eye"} /></button>
      <button type="button" className="iconbtn sm" title="Copy password" aria-label="Copy password" onClick={async () => { const v = value ?? (await get()); if (v === null) return; try { await navigator.clipboard.writeText(v); toast("Password copied"); } catch { setValue(v); toast("Shown instead. Copy it by hand."); } }}><Icon name="copy" /></button>
    </div>
  );
}

/**
 * Read more: text over 6 lines (data-clamp="text") and lists over 6 items (data-clamp="list")
 * get a toggle. Runs after every navigation and whenever the page content changes.
 */
export function Clamps() {
  const path = usePathname();
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLElement>("[data-clamp]").forEach((el) => {
        if (el.dataset.cdone) return; el.dataset.cdone = "1";
        const host = el.tagName === "TBODY" ? (el.closest(".tablebox") as HTMLElement) || el.closest("table")! : el;
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "link small morebtn";
        if (el.dataset.clamp === "list") {
          const n = el.children.length; if (n <= 6) return;
          el.classList.add("clamped"); btn.textContent = `Show all ${n}`;
          btn.addEventListener("click", () => { const c = el.classList.toggle("clamped"); btn.textContent = c ? `Show all ${n}` : "Show less"; });
        } else {
          el.classList.add("clamp6"); if (el.scrollHeight <= el.clientHeight + 2) { el.classList.remove("clamp6"); return; }
          btn.textContent = "Read more";
          btn.addEventListener("click", () => { const c = el.classList.toggle("clamp6"); btn.textContent = c ? "Read more" : "Show less"; });
        }
        host.insertAdjacentElement("afterend", btn);
      });
    };
    apply();
    const mo = new MutationObserver(() => apply());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [path]);
  return null;
}

/** Adds "@Full Name " to the textarea in the same form. */
export function MentionPicker({ people }: { people: { id: string; name: string }[] }) {
  return (
    <select className="fsm" aria-label="Mention someone" value="" onChange={(e) => {
      const name = e.currentTarget.selectedOptions[0]?.dataset.name; const ta = e.currentTarget.form?.querySelector("textarea");
      if (name && ta) { ta.value = (ta.value ? ta.value.replace(/\s*$/, " ") : "") + "@" + name + " "; ta.focus(); }
    }}>
      <option value="">@ Mention</option>
      {people.map((p) => <option key={p.id} value={p.id} data-name={p.name}>{p.name}</option>)}
    </select>
  );
}

/** Small toggle kept in the browser only (for example which tab is open). */
export function useLocal<X>(key: string, initial: X): [X, (v: X) => void] {
  const [v, setV] = useState<X>(initial);
  useEffect(() => { try { const raw = localStorage.getItem(key); if (raw !== null) setV(JSON.parse(raw)); } catch { /* storage may be blocked */ } }, [key]);
  return [v, (x: X) => { setV(x); try { localStorage.setItem(key, JSON.stringify(x)); } catch { /* ignore */ } }];
}
