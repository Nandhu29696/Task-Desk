import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { ROLE } from "@/lib/constants";
import { fmtShort, fmtTime, stampOf } from "@/lib/dates";
import { isAdmin } from "@/lib/permissions";
import { maybeRunDailyJob } from "@/lib/generator";
import { logout } from "../actions/auth";
import { readAll, readAnnouncement } from "../actions/notifications";
import { Bell, MenuButton, PageTitle, Sidebar } from "@/components/client/Shell";
import { ActionForm } from "@/components/client/ActionForm";
import { Modal } from "@/components/client/Widgets";
import { NotifItem } from "@/components/notif";
import { Icon } from "@/components/Icon";
import { Av } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  const { me, today } = ctx;
  void maybeRunDailyJob();

  const [pendLeave, policies, acks, credCount, unread, latest, ann, sess] = await Promise.all([
    isAdmin(me) ? prisma.leave.count({ where: { status: "PENDING", userId: { not: me.id } } }) : Promise.resolve(0),
    prisma.policy.count(),
    prisma.policyAck.count({ where: { userId: me.id } }),
    isAdmin(me) ? Promise.resolve(1) : prisma.credential.count({ where: me.role === "LEAD" ? { leadAccess: { not: "NONE" } } : { memberAccess: { not: "NONE" } } }),
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
    prisma.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 7, include: { from: { select: { name: true } } } }),
    prisma.announcement.findFirst({ where: { createdAt: { gte: new Date(Date.now() - 30 * 864e5) }, reads: { none: { userId: me.id } } }, orderBy: { createdAt: "desc" } }),
    prisma.session.findFirst({ where: { userId: me.id, day: today }, orderBy: { signedInAt: "asc" } }),
  ]);
  const unreadPolicies = Math.max(0, policies - acks);
  const inAt = sess ? stampOf(sess.signedInAt)!.slice(11, 16) : null;

  const primary = [
    { href: "/", key: "myday", label: "My dashboard" },
    { href: "/tasks", key: "tasks", label: "Tasks" },
    { href: "/projects", key: "projects", label: "Projects" },
    { href: "/team", key: "team", label: "Team" },
    { href: "/leave", key: "leave", label: "Leave", badge: pendLeave },
    { href: "/reports", key: "reports", label: "Reports" },
    { href: "/activity", key: "activity", label: "Activity log" },
  ];
  const more = [
    { name: "Office", items: [
      { href: "/calendar", key: "calendar", label: "Calendar" },
      { href: "/attendance", key: "attendance", label: "Attendance" },
      { href: "/people", key: "people", label: "People" },
      { href: "/policies", key: "policies", label: "Policies", badge: unreadPolicies },
      { href: "/tools", key: "tools", label: "Tools" },
      ...(credCount ? [{ href: "/credentials", key: "credentials", label: "Credentials" }] : []),
    ] },
    ...(isAdmin(me) ? [{ name: "Admin", items: [{ href: "/clients", key: "clients", label: "Clients" }] }] : []),
  ];
  const long = ann && ann.body.length > 150;

  return (
    <div className="app">
      <Sidebar primary={primary} more={more} me={{ id: me.id, name: me.name, sub: `${ROLE[me.role]}${inAt ? `, in at ${fmtTime(inAt)}` : ""}` }} signOut={logout} />
      <main className="main">
        <div className="sticky">
          <div className="topbar">
            <MenuButton /><img className="mlogo" src="/logo.png" alt="" />
            <PageTitle />
            <span className="grow" />
            <span className="tbdate small soft">{fmtShort(today)}{inAt ? `, in at ${fmtTime(inAt)}` : ""}</span>
            <Link className="btn btn-p btn-sm" href="/tasks/new" title="New task"><Icon name="plus" /><span className="hide-sm">New task</span></Link>
            <Bell unread={unread}>
              <div className="bellpanel panel" role="dialog" aria-label="Notifications">
                <div className="between" style={{ alignItems: "center", padding: "12px 14px 8px" }}><b>Notifications</b>
                  {unread ? <ActionForm action={readAll}><button className="link small">Mark all as read</button></ActionForm> : null}</div>
                {latest.length ? <ul className="nlist">{latest.map((n) => <NotifItem key={n.id} compact n={{ id: n.id, kind: n.kind, title: n.title, body: n.body, at: stampOf(n.createdAt)!, read: !!n.readAt, from: n.from?.name || null }} />)}</ul>
                  : <p className="small muted" style={{ padding: "10px 14px 16px" }}>You&apos;re all caught up.</p>}
                <div style={{ padding: "8px 14px 12px", borderTop: "1px solid var(--line2)" }}><Link className="link small" href="/notifications">See all notifications</Link></div>
              </div>
            </Bell>
            <Link className="tbav" href={`/people/${me.id}`} title="My profile"><Av name={me.name} size={30} /></Link>
          </div>
          {ann ? (
            <div className="annbar"><span className="annico"><Icon name="megaphone" /></span>
              <div className="anntext"><b>{ann.title}</b> <span>{long ? ann.body.slice(0, 150).replace(/\s+\S*$/, "") + "..." : ann.body}</span></div>
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                {long ? (
                  <Modal title={ann.title} trigger="Read more" triggerClass="btn btn-sm annbtn">
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{ann.body}</p>
                    <ActionForm action={readAnnouncement}><input type="hidden" name="id" value={ann.id} /><div className="row"><button className="btn btn-p"><Icon name="check" /> Mark as read</button></div></ActionForm>
                  </Modal>
                ) : null}
                <ActionForm action={readAnnouncement} quiet><input type="hidden" name="id" value={ann.id} /><button className="iconbtn sm annx" aria-label="Mark announcement as read" title="Mark as read"><Icon name="close" /></button></ActionForm>
              </div>
            </div>
          ) : null}
        </div>
        <div className="wrap">
          {me.mustChangePassword ? <div className="banner warn"><span className="chip chip-hol">Password</span><span>You are using a temporary password. <Link className="link" href="/account?first=1">Set your own password</Link> to keep your account safe.</span></div> : null}
          {children}
        </div>
      </main>
    </div>
  );
}

