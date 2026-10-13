// Attendance from sign in and sign out sessions.
import { diffK, hm2m } from "./dates";

export type SessLike = { userId: string; in: string; out: string | null };

/** Minutes in one session. An open session from today counts up to `nowStamp`. */
export function sessionMinutes(s: SessLike, today: string, nowStamp: string) {
  const end = s.out || (s.in.slice(0, 10) === today ? nowStamp : null);
  if (!end) return 0;
  return Math.max(0, diffK(end.slice(0, 10), s.in.slice(0, 10)) * 1440 + hm2m(end.slice(11, 16)) - hm2m(s.in.slice(11, 16)));
}

/** First sign in, last sign out and total minutes for one person on one day. */
export function dayAttendance(sessions: SessLike[], uid: string, k: string, today: string, nowStamp: string) {
  const ss = sessions.filter((s) => s.userId === uid && s.in.slice(0, 10) === k).sort((a, b) => (a.in < b.in ? -1 : 1));
  if (!ss.length) return null;
  const open = ss.some((s) => !s.out);
  return {
    first: ss[0].in.slice(11, 16),
    last: open ? null : ss.map((s) => s.out!.slice(11, 16)).sort().pop() || null,
    minutes: ss.reduce((a, s) => a + sessionMinutes(s, today, nowStamp), 0),
    count: ss.length,
    open,
  };
}
