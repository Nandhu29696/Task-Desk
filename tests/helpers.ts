// Shared test fixtures: the default team calendar with the real 2025 to 2026 holiday list.
import { DEFAULT_SETTINGS, HOLIDAY_LIST, type Settings } from "../src/lib/constants";
import type { CalLike } from "../src/lib/calendar";

export const holidays = HOLIDAY_LIST.map(([date, name, type]) => ({ date, name, type }));

/** Sundays off, 2nd and 4th Saturdays off, the seeded holidays. Override settings per test. */
export const cal = (settings: Partial<Settings> = {}): CalLike => ({ settings: { ...DEFAULT_SETTINGS, ...settings }, holidays });

export const rule = (r: Partial<{ frequency: string; weekday: number | null; monthDay: number | null; skipWeekends: boolean; dueOffsetDays: number; startDate: string; endDate: string | null }>) => ({
  frequency: "DAILY", weekday: null, monthDay: null, skipWeekends: true, dueOffsetDays: 0, startDate: "2026-01-01", endDate: null, ...r,
});
