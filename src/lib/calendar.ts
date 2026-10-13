// Working day logic. Pure functions over a Cal (settings + holidays), safe on server and client.
import { addK, dowK } from "./dates";
import type { Settings } from "./constants";

export type CalLike = { settings: Settings; holidays: { date: string; name: string; type: string }[] };

/** Weekly off: Sunday when sundayOff is on; Saturday by satRule (ALL_WORK, SECOND_FOURTH, ALL_OFF). */
export function isWeekend(cal: CalLike, k: string) {
  const d = dowK(k);
  if (d === 0) return cal.settings.sundayOff !== false;
  if (d === 6) {
    const r = cal.settings.satRule;
    if (r === "ALL_OFF") return true;
    if (r === "SECOND_FOURTH") { const n = Math.ceil(+k.slice(8, 10) / 7); return n === 2 || n === 4; }
  }
  return false;
}
/** A public or company holiday on that date. Restricted holidays are personal leave, not days off. */
export const holidayOn = (cal: CalLike, k: string) => cal.holidays.find((h) => h.date === k && h.type !== "RESTRICTED");
export const anyHolidayOn = (cal: CalLike, k: string) => cal.holidays.filter((h) => h.date === k);
export const isWorking = (cal: CalLike, k: string) => !isWeekend(cal, k) && !holidayOn(cal, k);
export function workingDays(cal: CalLike, from: string, to: string) { let n = 0; for (let k = from; k <= to; k = addK(k, 1)) if (isWorking(cal, k)) n++; return n; }
export const leaveDays = (cal: CalLike, l: { half: boolean; from: string; to: string }) => (l.half ? 0.5 : workingDays(cal, l.from, l.to));
export function nthWorking(cal: CalLike, from: string, n: number, dir: number) { let k = from, c = 0, g = 0; while (c < n && g++ < 60) { k = addK(k, dir); if (isWorking(cal, k)) c++; } return k; }
export function offLabel(s: Settings) {
  return [s.sundayOff !== false ? "Sundays" : "", s.satRule === "ALL_OFF" ? "all Saturdays" : s.satRule === "SECOND_FOURTH" ? "2nd and 4th Saturdays" : ""].filter(Boolean).join(" and ") || "None";
}
