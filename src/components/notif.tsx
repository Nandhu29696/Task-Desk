// Notification row, used by the bell, the dashboard widget and the Notifications page.
import { NICON } from "@/lib/constants";
import { fmtStamp } from "@/lib/dates";
import { openNotification, toggleRead } from "@/app/actions/notifications";
import { Icon } from "./Icon";
import { ActionForm } from "./client/ActionForm";

export type NotifRow = { id: string; kind: string; title: string; body: string; at: string; read: boolean; from: string | null };

export function NotifItem({ n, compact = false }: { n: NotifRow; compact?: boolean }) {
  const body = compact && n.body.length > 110 ? n.body.slice(0, 110) + "..." : n.body;
  return (
    <li className={`nitem ${n.read ? "" : "unread"}`}>
      <span className={`nico n-${n.kind}`}><Icon name={NICON[n.kind] || "bell"} /></span>
      <form action={openNotification} style={{ flex: 1, minWidth: 0, display: "flex" }}>
        <input type="hidden" name="id" value={n.id} />
        <button className="nbody">
          <b>{n.title}</b>
          {body ? <span className="nmsg" data-clamp={compact ? undefined : "text"}>{body}</span> : null}
          <span className="xs muted">{n.from || "TaskDesk"}, {fmtStamp(n.at)}</span>
        </button>
      </form>
      {compact ? (n.read ? null : <span className="ndot" aria-label="Unread" />) : (
        <ActionForm action={toggleRead} quiet>
          <input type="hidden" name="id" value={n.id} />
          <button className="iconbtn sm" title={n.read ? "Mark as unread" : "Mark as read"} aria-label={n.read ? "Mark as unread" : "Mark as read"}><Icon name={n.read ? "mail" : "check"} /></button>
        </ActionForm>
      )}
    </li>
  );
}
