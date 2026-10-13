"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { Av } from "../ui";

type NavItem = { href: string; key: string; label: string; badge?: number };
type Group = { name: string; items: NavItem[] };

const TITLES: [RegExp, string][] = [
  [/^\/$/, "My dashboard"], [/^\/tasks\/new/, "New task"], [/^\/tasks\/[^/]+/, "Task"], [/^\/tasks/, "Tasks"], [/^\/team/, "Team"],
  [/^\/projects\/new/, "New project"], [/^\/projects\/[^/]+/, "Project"], [/^\/projects/, "Projects"], [/^\/calendar/, "Calendar"], [/^\/leave/, "Leave"],
  [/^\/attendance/, "Attendance"], [/^\/reports/, "Reports"], [/^\/people\/[^/]+/, "Profile"], [/^\/people/, "People"], [/^\/policies/, "Policies"],
  [/^\/tools/, "Tools"], [/^\/clients\/[^/]+/, "Client"], [/^\/clients/, "Clients"], [/^\/credentials/, "Credentials"], [/^\/notifications/, "Notifications"],
  [/^\/activity/, "Activity log"], [/^\/account/, "My account"],
];
const sectionOf = (path: string) => "/" + (path.split("/")[1] || "");

export function Sidebar({ primary, more, me, signOut }: { primary: NavItem[]; more: Group[]; me: { id: string; name: string; sub: string }; signOut: () => Promise<void> }) {
  const path = usePathname();
  const section = sectionOf(path);
  const [rail, setRail] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { try { setRail(localStorage.getItem("td_rail") === "1"); setMoreOpen(localStorage.getItem("td_more") === "1"); } catch { /* ignore */ } }, []);
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => { const h = () => setDrawer(true); window.addEventListener("td:drawer", h); return () => window.removeEventListener("td:drawer", h); }, []);
  const inMore = more.some((g) => g.items.some((i) => i.href === section));
  const open = moreOpen || inMore;
  const hidden = more.reduce((a, g) => a + g.items.reduce((b, i) => b + (i.badge || 0), 0), 0);
  const btn = (i: NavItem) => (
    <Link key={i.key} href={i.href} aria-current={section === i.href ? "page" : undefined} className={i.badge ? "hasbadge" : ""} title={i.label}>
      <Icon name={i.key} /><span className="lbl">{i.label}</span>{i.badge ? <span className="chip navbadge">{i.badge}</span> : null}
    </Link>
  );
  const toggleRail = () => { const v = !rail; setRail(v); try { localStorage.setItem("td_rail", v ? "1" : "0"); } catch { /* ignore */ } };
  const toggleMore = () => { const v = !moreOpen; setMoreOpen(v); try { localStorage.setItem("td_more", v ? "1" : "0"); } catch { /* ignore */ } };
  return (
    <>
      <aside className={`side ${rail ? "rail" : ""} ${drawer ? "open" : ""}`} aria-label="Sidebar">
        <div className="brand">
          <img src="/logo.png" alt="Search Engineers" />
          <span className="bname"><b>TaskDesk</b><small>Search Engineers</small></span>
          <button type="button" className="iconbtn collapse-btn" onClick={toggleRail} aria-label={rail ? "Expand sidebar" : "Collapse sidebar"} title={rail ? "Expand sidebar" : "Collapse sidebar"}><Icon name="panel" /></button>
          <button type="button" className="iconbtn mobile-close" onClick={() => setDrawer(false)} aria-label="Close menu"><Icon name="close" /></button>
        </div>
        <nav className="nav" aria-label="Main">
          {primary.map(btn)}
          {open && !rail ? more.map((g) => <div key={g.name} style={{ display: "contents" }}><div className="navrule"><span>{g.name}</span></div>{g.items.map(btn)}</div>) : null}
          {rail && inMore ? more.flatMap((g) => g.items).filter((i) => i.href === section).map(btn) : null}
          {inMore && !rail ? null : (
            <button type="button" className={`navmore ${!open && hidden ? "hasbadge" : ""}`} onClick={() => (rail ? toggleRail() : toggleMore())} aria-expanded={open && !rail} title={open && !rail ? "View less" : "View more"}>
              <Icon name={open && !rail ? "less" : "more"} /><span className="lbl">{open && !rail ? "View less" : "View more"}</span>{(!open || rail) && hidden ? <span className="chip navbadge">{hidden}</span> : null}
            </button>
          )}
        </nav>
        <div className="who">
          <Link className="who-row" href={`/people/${me.id}`} title="My profile"><Av name={me.name} size={32} /><div style={{ minWidth: 0 }}><b>{me.name}</b><span>{me.sub}</span></div></Link>
          <form action={signOut}><button className="iconbtn" aria-label="Sign out" title="Sign out"><Icon name="signout" /></button></form>
        </div>
      </aside>
      <div className={`scrim ${drawer ? "on" : ""}`} onClick={() => setDrawer(false)} />
    </>
  );
}

export function PageTitle() {
  const path = usePathname();
  return <b className="tbtitle">{TITLES.find(([re]) => re.test(path))?.[1] || "TaskDesk"}</b>;
}

export function MenuButton() {
  return <button type="button" className="iconbtn mmenu" onClick={() => window.dispatchEvent(new Event("td:drawer"))} aria-label="Open menu"><Icon name="menu" /></button>;
}

/** Bell with unread count. The panel content is rendered on the server; the count is checked every 60 seconds. */
export function Bell({ unread, children }: { unread: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  useEffect(() => {
    const t = setInterval(async () => {
      try { const r = await fetch("/api/notifications/count", { cache: "no-store" }); const j = await r.json(); if (typeof j.unread === "number" && j.unread !== unread) router.refresh(); } catch { /* offline */ }
    }, 60000);
    return () => clearInterval(t);
  }, [unread, router]);
  return (
    <div className="bellwrap" ref={wrap}>
      <button type="button" className={`iconbtn bell ${open ? "on" : ""}`} onClick={() => setOpen(!open)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <Icon name="bell" />{unread ? <span className="bcount">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      {open ? children : null}
    </div>
  );
}
