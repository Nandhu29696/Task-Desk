# TaskDesk code conventions

TaskDesk is one Next.js 15 app (App Router, React 19) with Prisma 6. Pages are server components; every write is a server action. The look and behaviour come from the approved clickable preview, so pages reuse the preview's CSS class names one to one.

## Where things live

| Path | Holds |
| --- | --- |
| `prisma/schema.prisma` | All models. Day keys (dates without time) are strings like `2026-10-11`; moments are `DateTime` |
| `src/lib/constants.ts` | Labels and allowed values (STATUS, FREQ, LINE, STAGE, LTYPE, TEMPLATES, HOLIDAY_LIST and more) |
| `src/lib/dates.ts` | Day key math and formatting in the team time zone: `todayKey`, `addK`, `diffK`, `startOfWeek`, `fmtDate`, `fmtShort`, `fmtStamp`, `fmtTime`, `mins`, `inr`, `pct`, `dueLabel`, `stampOf`, `fromLocal` |
| `src/lib/calendar.ts` | `isWeekend`, `holidayOn`, `isWorking`, `workingDays`, `leaveDays`, `nthWorking`, `offLabel` (pure, take a `Cal`) |
| `src/lib/permissions.ts` | Every `can...` rule. Use in pages to hide buttons and in actions to refuse writes |
| `src/lib/model.ts` | Plain types (`U`, `P`, `R`, `T`, `Leave`, `Sess`, `Act`, `TLog`, `Cmt`) and loaders (`loadTasks`, `loadProjects`, `loadRules`, `loadLeaves`, `loadSessions`, `loadActivities`, `loadTimeLogs`, `loadComments`, `loadCal`, `saveSetting`) |
| `src/lib/context.ts` | `getCtx()`: signed in user, today, now stamp, all users, `user(id)`, active users, calendar, people on leave today. `userOpts(ctx)` |
| `src/lib/logic.ts` | Pure rules: `sortTasks`, `blockerCount`, `openDeps`, `pendingApprovals`, `mentionedUsers`, `actCat`, client money helpers |
| `src/lib/recurrence.ts` | Pure rule helpers: `matches`, `occurrences`, `scheduleDate`, `describeRule`, `plannedPerMonth` |
| `src/lib/generator.ts` | Writes tasks: `generate`, `resetRuleFuture`, `rescheduleAll`, `renewalReminders`, `runDailyJob` |
| `src/lib/taskops.ts` | `changeStatus` (with blockers and release of waiting tasks), `blockersOf`, `releaseDependents` |
| `src/lib/log.ts` | `act(db, userId, action, detail, taskId, projectId)`, `notify`, `notifyMany`, `notifyAdmins` |
| `src/lib/crypto.ts` | `encrypt`, `decrypt` for tool and credential passwords |
| `src/lib/attendance.ts` | `dayAttendance`, `sessionMinutes` (pure) |
| `src/lib/action.ts` | `run`, `ok`, `fail`, `refuse`, form helpers `str`, `opt`, `int`, `bool`, `list` |
| `src/components/ui.tsx` | `Av`, `Person`, `StPill`, `Cad`, `Pri`, `Due`, `Stats`, `Empty`, `Options`, `Bar`, `CommsChips`, `CommentText` |
| `src/components/tasklines.tsx` | `TaskLines`, `TaskLine`, `MiniLine`, `Tick`, `StatusCtl`, `lineCtx` |
| `src/components/client/ActionForm.tsx` | `ActionForm`, `AutoSubmit`, `AutoCheck`, `toast` |
| `src/components/client/Widgets.tsx` | `Modal`, `ConfirmButton`, `CopyButton`, `SecretBox`, `MentionPicker`, `Clamps` |
| `src/components/Icon.tsx` | `Icon` with the preview's icon names, `CHECK` |
| `src/app/actions/*.ts` | Server actions per module |

## Patterns

**Pages.** `const ctx = await getCtx();` then load what the page needs. In Next 15 `params` and `searchParams` are Promises: `export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> })`. Keep filters, tabs and periods in the URL (search params) so pages stay server rendered and links can be shared.

**Writes.** Every action lives in a `"use server"` file and has the signature `(prev: Result, fd: FormData) => Promise<Result>`:

```ts
export async function addThing(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    if (!isAdmin(me)) refuse("Only the admin can do this.");
    await prisma.$transaction(async (tx) => { /* write, then act(tx, ...) and notify(tx, ...) */ });
    return ok("Saved", { href: "/somewhere" }); // href is optional: the form navigates there
  });
}
```

`run` loads the user, refreshes all pages afterwards and turns `refuse(...)` into a toast. Always check permissions in the action, never only in the page. Write `act()` and `notify()` in the same transaction as the change. Never notify the person who did the action.

**Forms and buttons.** Wrap with `<ActionForm action={addThing}>` and pass ids with hidden inputs. A button that acts on one item is a tiny ActionForm with a hidden `id`. Dropdowns that save on change use `<AutoSubmit name="status" defaultValue={...}>`. Use `reset` on ActionForm for add forms. Delete buttons use `<ConfirmButton label="Delete" />` inside the ActionForm (two clicks).

**Popups.** Every edit of an existing record opens in `<Modal title="Edit ..." trigger={<><Icon name="edit" /> Edit</>} triggerClass="btn btn-q btn-sm">` with an ActionForm inside; the popup closes when the form succeeds.

**Links.** Use `<Link href>` with the preview's class names (`link`, `tl-title`, `btn btn-q`). Routes: `/`, `/tasks`, `/tasks/new`, `/tasks/[id]`, `/projects`, `/projects/new`, `/projects/[id]`, `/team`, `/leave`, `/reports`, `/activity`, `/calendar`, `/attendance`, `/people`, `/people/[id]`, `/policies`, `/tools`, `/credentials`, `/clients`, `/clients/[id]`, `/notifications`, `/account`.

**Read more.** Add `data-clamp="text"` to long text (cut at 6 lines) and `data-clamp="list"` to lists or `tbody` over 6 items. The `Clamps` component adds the toggle.

**Passwords.** Never send a password with the page. Pass a bound server action to `<SecretBox reveal={revealX.bind(null, id)} />`; the action checks access, logs a CredentialView and returns `{ value }` or `{ error }`.

**Markup.** Port the preview's HTML from its view function one to one: `class` becomes `className`, inline styles become objects, `data-go` buttons become `Link`s, `data-act` buttons become ActionForm buttons, `S._modal` popups become `Modal`. The CSS in `src/app/globals.css` already has every class.

## Wording

Everything people read is plain English. Never use hyphens, en dashes or em dashes in visible text: write "one time", "sign in", "40 to 60". Keep the preview's labels and messages exactly.
