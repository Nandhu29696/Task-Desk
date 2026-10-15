// Working days, leave counting, weekly off rules and attendance totals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { holidayOn, isWeekend, isWorking, leaveDays, nthWorking, offLabel, workingDays } from "../src/lib/calendar";
import { dayAttendance, sessionMinutes } from "../src/lib/attendance";
import { DEFAULT_SETTINGS } from "../src/lib/constants";
import { cal } from "./helpers";

const c = cal();

test("a week of leave counts only working days", () => {
  // Mon 12 to Sun 18 Oct 2026: Mon to Fri plus the working 3rd Saturday
  assert.equal(workingDays(c, "2026-10-12", "2026-10-18"), 6);
  assert.equal(leaveDays(c, { half: false, from: "2026-10-12", to: "2026-10-18" }), 6);
});

test("leave over public holidays costs nothing", () => {
  assert.equal(leaveDays(c, { half: false, from: "2026-10-19", to: "2026-10-20" }), 0);
});

test("a half day counts as half", () => {
  assert.equal(leaveDays(c, { half: true, from: "2026-10-15", to: "2026-10-15" }), 0.5);
});

test("restricted holidays are working days for everyone else", () => {
  assert.equal(holidayOn(c, "2026-11-09"), undefined);
  assert.equal(isWorking(c, "2026-11-09"), true);
  assert.equal(isWorking(c, "2026-10-19"), false);
});

test("next working day skips weekly offs and holidays", () => {
  assert.equal(nthWorking(c, "2026-10-16", 1, 1), "2026-10-17");
  assert.equal(nthWorking(c, "2026-10-17", 1, 1), "2026-10-21");
  assert.equal(nthWorking(c, "2026-10-21", 1, -1), "2026-10-17");
});

test("weekly off settings change which Saturdays are off", () => {
  assert.equal(isWeekend(cal({ satRule: "ALL_OFF" }), "2026-10-17"), true);
  assert.equal(isWeekend(cal({ satRule: "ALL_WORK" }), "2026-10-10"), false);
  assert.equal(isWeekend(cal({ sundayOff: false }), "2026-10-18"), false);
  assert.equal(offLabel(DEFAULT_SETTINGS), "Sundays and 2nd and 4th Saturdays");
  assert.equal(offLabel({ ...DEFAULT_SETTINGS, sundayOff: false, satRule: "ALL_WORK" }), "None");
});

test("a closed session counts its minutes", () => {
  assert.equal(sessionMinutes({ userId: "u", in: "2026-10-15 09:30", out: "2026-10-15 18:15" }, "2026-10-15", "2026-10-15 20:00"), 525);
});

test("an open session today counts up to now, an old open one counts nothing", () => {
  assert.equal(sessionMinutes({ userId: "u", in: "2026-10-15 09:00", out: null }, "2026-10-15", "2026-10-15 11:30"), 150);
  assert.equal(sessionMinutes({ userId: "u", in: "2026-10-14 09:00", out: null }, "2026-10-15", "2026-10-15 11:30"), 0);
});

test("a day with two sessions reports first in, last out and the total", () => {
  const s = [
    { userId: "u", in: "2026-10-15 13:30", out: "2026-10-15 18:00" },
    { userId: "u", in: "2026-10-15 09:05", out: "2026-10-15 12:30" },
    { userId: "x", in: "2026-10-15 08:00", out: "2026-10-15 17:00" },
  ];
  const a = dayAttendance(s, "u", "2026-10-15", "2026-10-15", "2026-10-15 20:00");
  assert.deepEqual(a, { first: "09:05", last: "18:00", minutes: 205 + 270, count: 2, open: false });
  assert.equal(dayAttendance(s, "u", "2026-10-16", "2026-10-15", "2026-10-15 20:00"), null);
});

test("a day still open has no last sign out", () => {
  const a = dayAttendance([{ userId: "u", in: "2026-10-15 09:00", out: null }], "u", "2026-10-15", "2026-10-15", "2026-10-15 10:00");
  assert.equal(a?.open, true);
  assert.equal(a?.last, null);
});
