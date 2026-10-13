// Small presentational pieces shared by every page. No hooks, so they work in server and client components.
import Link from "next/link";
import type { ReactNode } from "react";
import { COMMS, FREQ, PRIORITY, STATUS } from "@/lib/constants";
import { diffK, dueLabel } from "@/lib/dates";
import { initials } from "@/lib/logic";

export function avHue(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

export function Av({ name, size = 26 }: { name: string; size?: number }) {
  return <span className="av" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: `hsl(${avHue(name)} 32% 38%)` }}>{initials(name)}</span>;
}

type PersonLike = { id: string; name: string } | null | undefined;
/** Avatar and name. Pass onLeave to add the "On leave" chip. */
export function Person({ u, size = 22, onLeave = false, link = false }: { u: PersonLike; size?: number; onLeave?: boolean; link?: boolean }) {
  if (!u) return <span className="muted">Unassigned</span>;
  const inner = <span className="person"><Av name={u.name} size={size} />{u.name}{onLeave ? <> <span className="chip chip-leave">On leave</span></> : null}</span>;
  return link ? <Link href={`/people/${u.id}`} className="link plink">{inner}</Link> : inner;
}

export const StPill = ({ s }: { s: string }) => <span className={`st st-${s}`}>{STATUS[s] || s}</span>;
export const Cad = ({ f }: { f: string }) => <span className={`cad cad-${f}`}>{FREQ[f] || f}</span>;
export function Pri({ p }: { p: string }) {
  const n = ({ URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as Record<string, number>)[p] || 1;
  return <span className={`pri pri-${p}`} title={`${PRIORITY[p]} priority`}><i aria-hidden="true">{[1, 2, 3, 4].map((i) => <b key={i} className={i <= n ? "on" : ""} style={{ height: 3 + i * 2 }} />)}</i>{PRIORITY[p]}</span>;
}
export function Due({ k, today, done = false }: { k: string | null | undefined; today: string; done?: boolean }) {
  if (!k) return <span className="due done">No date</span>;
  const n = diffK(k, today);
  const c = done ? "done" : n < 0 ? "late" : n === 0 ? "today" : "";
  return <span className={`due ${c}`}>{dueLabel(k, today, done)}</span>;
}
export const CommsChips = ({ list }: { list: string[] }) => <>{list.map((c) => <span key={c} className="chip comm">{COMMS[c] || c}</span>)}</>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export type StatItem = [label: ReactNode, value: ReactNode, cls?: string, sub?: ReactNode];
export function Stats({ items, cls = "" }: { items: StatItem[]; cls?: string }) {
  return <dl className={`stats ${cls}`}>{items.map((s, i) => <div className="stat" key={i}><dt>{s[0]}</dt><dd className={s[2] || ""}>{s[1]}</dd>{s[3] ? <dd className="sub">{s[3]}</dd> : null}</div>)}</dl>;
}

/** <option> list from [value, label] pairs. */
export function Options({ opts }: { opts: [string | number, string][] }) {
  return <>{opts.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}</>;
}

export function Bar({ value, max, cls = "" }: { value: number; max: number; cls?: string }) {
  return <span className={`mbar ${cls}`}><span style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} /></span>;
}

/** Highlights @mentions of known people in an escaped comment. */
export function CommentText({ body, names }: { body: string; names: string[] }) {
  if (!names.length) return <>{body}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(@(?:" + [...names].sort((a, b) => b.length - a.length).map(esc).join("|") + ")\\b)", "gi");
  const parts = body.split(re);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} className="mention">{p}</b> : <span key={i}>{p}</span>))}</>;
}
