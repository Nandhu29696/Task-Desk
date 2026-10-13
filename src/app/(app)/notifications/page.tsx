import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx } from "@/lib/context";
import { fmtStamp, stampOf } from "@/lib/dates";
import { isAdmin } from "@/lib/permissions";
import { readAll, readAnnouncement, shareAnnouncement } from "@/app/actions/notifications";
import { ActionForm } from "@/components/client/ActionForm";
import { NotifItem } from "@/components/notif";
import { Icon } from "@/components/Icon";
import { Empty } from "@/components/ui";

const TABS: [string, string][] = [["ALL", "All"], ["UNREAD", "Unread"], ["MENTION", "Mentions"], ["ASSIGNED", "Tasks"], ["APPROVAL", "Approvals"], ["ANNOUNCE", "Announcements"]];

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getCtx();
  const { me } = ctx;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "ALL";
  const admin = isAdmin(me);

  const [unreadByKind, list, anns, activeCount] = await Promise.all([
    prisma.notification.groupBy({ by: ["kind"], where: { userId: me.id, readAt: null }, _count: { _all: true } }),
    tab === "ANNOUNCE" ? Promise.resolve([]) : prisma.notification.findMany({
      where: { userId: me.id, ...(tab === "ALL" ? {} : tab === "UNREAD" ? { readAt: null } : { kind: tab }) },
      orderBy: { createdAt: "desc" }, take: 300, include: { from: { select: { name: true } } },
    }),
    tab === "ANNOUNCE" ? prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, include: { by: { select: { name: true } }, reads: { select: { userId: true, user: { select: { active: true } } } } } }) : Promise.resolve([]),
    prisma.user.count({ where: { active: true } }),
  ]);
  const unreadOf = (k: string) => unreadByKind.find((x) => x.kind === k)?._count._all || 0;
  const unread = unreadByKind.reduce((a, x) => a + x._count._all, 0);

  return (
    <>
      <header className="between">
        <div><h1>Notifications</h1><p className="soft">Task assignments, mentions, approvals, leave updates, renewals and announcements.</p></div>
        <div className="row" style={{ gap: 8 }}>
          {unread ? <ActionForm action={readAll} style={{ display: "contents" }}><button className="btn btn-q"><Icon name="check" /> Mark all as read</button></ActionForm> : null}
          {admin && tab !== "ANNOUNCE" ? <Link className="btn btn-p" href="/notifications?tab=ANNOUNCE"><Icon name="megaphone" /> New announcement</Link> : null}
        </div>
      </header>
      <div className="seg" role="tablist" aria-label="Filter notifications">
        {TABS.map(([k, l]) => {
          const n = k === "ALL" ? 0 : k === "UNREAD" ? unread : unreadOf(k);
          return <Link key={k} role="tab" href={k === "ALL" ? "/notifications" : `/notifications?tab=${k}`} aria-pressed={tab === k}>{l}{n ? <> <span className="segn">{n}</span></> : null}</Link>;
        })}
      </div>
      {tab === "ANNOUNCE" ? (
        <>
          {admin ? (
            <section className="panel pad stack"><h2>Share an announcement</h2>
              <ActionForm action={shareAnnouncement} reset className="stack">
                <div><label className="lbl" htmlFor="an-t">Title</label><input className="field" id="an-t" name="title" required placeholder="Office closed on Ayudha Pooja" /></div>
                <div><label className="lbl" htmlFor="an-b">Message</label><textarea className="field" id="an-b" name="body" rows={4} required placeholder="Details and company updates for the whole team" /></div>
                <div><button className="btn btn-p"><Icon name="megaphone" /> Share with everyone</button></div>
                <p className="xs muted">Everyone gets a notification and sees it as a banner at the top until they read it.</p>
              </ActionForm>
            </section>
          ) : null}
          <section className="stack">
            {anns.length ? anns.map((a) => {
              const read = a.reads.some((r) => r.userId === me.id);
              return (
                <article key={a.id} className={`panel pad stack ann ${read ? "" : "unread"}`}>
                  <div className="between" style={{ alignItems: "flex-start" }}>
                    <div><h3>{a.title}</h3><p className="xs muted">{a.by?.name || "Admin"}, {fmtStamp(stampOf(a.createdAt))}</p></div>
                    {read ? <span className="chip lv-APPROVED">Read</span> : (
                      <ActionForm action={readAnnouncement} style={{ display: "contents" }}><input type="hidden" name="id" value={a.id} /><button className="btn btn-q btn-sm"><Icon name="check" /> Mark as read</button></ActionForm>
                    )}
                  </div>
                  <p style={{ whiteSpace: "pre-wrap" }} data-clamp="text">{a.body}</p>
                  {admin ? <p className="xs muted">Read by {a.reads.filter((r) => r.user.active).length} of {activeCount}</p> : null}
                </article>
              );
            }) : <Empty>No announcements yet.</Empty>}
          </section>
        </>
      ) : list.length ? (
        <ul className="nlist panel">{list.map((n) => <NotifItem key={n.id} n={{ id: n.id, kind: n.kind, title: n.title, body: n.body, at: stampOf(n.createdAt)!, read: !!n.readAt, from: n.from?.name || null }} />)}</ul>
      ) : <Empty>{tab === "UNREAD" ? "No unread notifications. You're all caught up." : "Nothing here yet."}</Empty>}
    </>
  );
}
