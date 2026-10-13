// Day keys ("YYYY MM DD" written as an ISO date) and local stamps ("YYYY MM DD HH:MM") in the team time zone.
// Every "today" decision in the app goes through these helpers.
export const TZ = process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";

export const kd = (k: string) => new Date(k + "T00:00:00Z");
export const dk = (d: Date) => d.toISOString().slice(0, 10);
export const addK = (k: string, n: number) => dk(new Date(kd(k).getTime() + n * 864e5));
export const addMonths = (k: string, n: number) => { const d = kd(k.slice(0, 7) + "-01"); d.setUTCMonth(d.getUTCMonth() + n); return dk(d); };
export const diffK = (a: string, b: string) => Math.round((kd(a).getTime() - kd(b).getTime()) / 864e5);
export const dowK = (k: string) => kd(k).getUTCDay();
export const lastDom = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const startOfWeek = (k: string) => { const d = dowK(k); return addK(k, d === 0 ? -6 : 1 - d); };
export const monthStart = (k: string) => k.slice(0, 7) + "-01";
export const monthEnd = (k: string) => addK(addMonths(k, 1), -1);
export const quarterStart = (k: string) => { const m = Number(k.slice(5, 7)); return k.slice(0, 5) + String(m - ((m - 1) % 3)).padStart(2, "0") + "-01"; };
export const hm2m = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
export const m2hm = (m: number) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(Math.round(m % 60)).padStart(2, "0");

const dayFmt = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hmFmt = () => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

/** Today as a day key in the team time zone. */
export const todayKey = () => dayFmt().format(new Date());
/** The day key of a moment, in the team time zone. */
export const dayOf = (d: Date) => dayFmt().format(d);
/** Local stamp "day HH:MM" of a moment, in the team time zone. Used for display and the activity log. */
export const stampOf = (d: Date | null | undefined) => (d ? dayFmt().format(d) + " " + hmFmt().format(d).replace(/^24/, "00") : null);
/** Converts a local day and HH:MM in the team time zone back to a UTC Date. */
export function fromLocal(day: string, hm = "00:00"): Date {
  const guess = new Date(`${day}T${hm}:00Z`);
  const shown = stampOf(guess)!;
  const diff = (kd(shown.slice(0, 10)).getTime() + hm2m(shown.slice(11, 16)) * 6e4) - (kd(day).getTime() + hm2m(hm) * 6e4);
  return new Date(guess.getTime() - diff);
}

export const fmtDate = (k?: string | null) => (k ? kd(k).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "No date");
export const fmtShort = (k: string) => kd(k).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const fmtLong = (k: string) => kd(k).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const fmtMonth = (k: string) => kd(k.slice(0, 7) + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const fmtMon = (k: string) => kd(k.slice(0, 7) + "-01").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
export function fmtTime(hm?: string | null) { if (!hm) return ""; let h = +hm.slice(0, 2); const m = hm.slice(3, 5); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${m} ${ap}`; }
export const fmtStamp = (s?: string | null) => (s ? kd(s.slice(0, 10)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) + ", " + fmtTime(s.slice(11, 16)) : "");
export function mins(m?: number | null) { const v = Math.round(m || 0); const h = Math.floor(v / 60), r = v % 60; if (!h) return r + "m"; return r ? `${h}h ${r}m` : `${h}h`; }
export const pct = (n: number) => Math.round(n * 100) + "%";
export const inr = (n?: number | null) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

export function dueLabel(k: string | null | undefined, today: string, done = false) {
  if (!k) return "No date";
  const n = diffK(k, today);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return done ? "Yesterday" : "1 day late";
  if (n < 0) return done ? fmtShort(k) : `${-n} days late`;
  if (n < 7) return fmtShort(k);
  return fmtDate(k);
}

export const isDayKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
