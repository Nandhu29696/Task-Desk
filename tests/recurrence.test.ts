// Recurring task engine: which days a rule fires on, and where holidays move them.
// October 2026: Sun 18 is a weekly off, Sat 10 and Sat 24 are the 2nd and 4th Saturdays (off),
// Sat 17 is a working Saturday, Mon 19 Ayudha Pooja and Tue 20 Vijayadasami are public holidays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRule, matches, occurrences, plannedPerMonth, scheduleDate } from "../src/lib/recurrence";
import { cal, rule } from "./helpers";

const c = cal();

test("daily on working days skips Sundays and the 2nd and 4th Saturdays", () => {
  const r = rule({ frequency: "DAILY", skipWeekends: true });
  assert.equal(matches(c, r, "2026-10-16"), true); // Friday
  assert.equal(matches(c, r, "2026-10-17"), true); // 3rd Saturday, working
  assert.equal(matches(c, r, "2026-10-18"), false); // Sunday
  assert.equal(matches(c, r, "2026-10-10"), false); // 2nd Saturday
  assert.equal(matches(c, r, "2026-10-24"), false); // 4th Saturday
});

test("daily every day includes weekends", () => {
  assert.equal(matches(c, rule({ frequency: "DAILY", skipWeekends: false }), "2026-10-18"), true);
});

test("weekly fires only on its weekday", () => {
  const r = rule({ frequency: "WEEKLY", weekday: 3 });
  assert.equal(matches(c, r, "2026-10-14"), true); // Wednesday
  assert.equal(matches(c, r, "2026-10-15"), false);
});

test("monthly day 31 falls on the last day of shorter months", () => {
  const r = rule({ frequency: "MONTHLY", monthDay: 31 });
  assert.equal(matches(c, r, "2026-02-28"), true);
  assert.equal(matches(c, r, "2026-04-30"), true);
  assert.equal(matches(c, r, "2026-05-31"), true);
  assert.equal(matches(c, r, "2026-05-30"), false);
});

test("quarterly counts every third month from the start month", () => {
  const r = rule({ frequency: "QUARTERLY", monthDay: 10, startDate: "2026-01-10" });
  assert.equal(matches(c, r, "2026-01-10"), true);
  assert.equal(matches(c, r, "2026-04-10"), true);
  assert.equal(matches(c, r, "2026-07-10"), true);
  assert.equal(matches(c, r, "2026-03-10"), false);
  assert.equal(matches(c, r, "2026-04-11"), false);
});

test("occurrences stay inside the start and end dates", () => {
  const r = rule({ frequency: "WEEKLY", weekday: 1, startDate: "2026-10-05", endDate: "2026-10-20" });
  assert.deepEqual(occurrences(c, r, "2026-09-01", "2026-12-31"), ["2026-10-05", "2026-10-12", "2026-10-19"]);
});

test("a one time rule falls due its offset days after the start, once", () => {
  const r = rule({ frequency: "ONCE", startDate: "2026-10-13", dueOffsetDays: 3 });
  assert.deepEqual(occurrences(c, r, "2026-10-13", "2026-10-20"), ["2026-10-16"]);
  assert.deepEqual(occurrences(c, r, "2026-10-17", "2026-10-20"), []);
});

test("daily routines are skipped on a public holiday", () => {
  assert.equal(scheduleDate(c, { frequency: "DAILY" }, "2026-10-19"), null);
  assert.equal(scheduleDate(c, { frequency: "DAILY" }, "2026-10-16"), "2026-10-16");
});

test("other cadences move to the next working day after holidays", () => {
  // Mon 19 and Tue 20 are both holidays, so Monday work moves to Wednesday 21
  assert.equal(scheduleDate(c, { frequency: "WEEKLY" }, "2026-10-19"), "2026-10-21");
  // Fri 25 Dec 2026 is a holiday; Sat 26 is the 4th Saturday and Sun 27 is off, so it moves to Mon 28
  assert.equal(scheduleDate(c, { frequency: "MONTHLY" }, "2026-12-25"), "2026-12-28");
});

test("restricted holidays are personal and do not move work", () => {
  assert.equal(scheduleDate(c, { frequency: "WEEKLY" }, "2026-11-09"), "2026-11-09");
  assert.equal(scheduleDate(c, { frequency: "DAILY" }, "2026-11-09"), "2026-11-09");
});

test("rules read in plain words", () => {
  assert.equal(describeRule(rule({ frequency: "DAILY", skipWeekends: true })), "Every working day");
  assert.equal(describeRule(rule({ frequency: "WEEKLY", weekday: 5 })), "Every Friday");
  assert.equal(describeRule(rule({ frequency: "MONTHLY", monthDay: 3 })), "Monthly on day 3");
  assert.equal(describeRule(rule({ frequency: "QUARTERLY", monthDay: 7 })), "Every 3 months on day 7");
  assert.equal(describeRule(rule({ frequency: "ONCE", startDate: "2026-10-13", dueOffsetDays: 2 })), "One time, due 15 Oct 2026");
});

test("planned minutes per month only count active rules", () => {
  const minutes = plannedPerMonth([
    { active: true, frequency: "WEEKLY", skipWeekends: true, estimate: 60 },
    { active: true, frequency: "MONTHLY", skipWeekends: true, estimate: 120 },
    { active: false, frequency: "DAILY", skipWeekends: true, estimate: 30 },
  ]);
  assert.equal(Math.round(minutes), Math.round(4.3 * 60 + 120));
});
