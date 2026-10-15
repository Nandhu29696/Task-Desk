# TaskDesk for Search Engineers

TaskDesk is the team's work app. Project settings create recurring tasks automatically; people work them on a Kanban board, discuss them with mentions and ask each other for approvals; the admin sees attendance, leave, clients, renewals and reports in one place. This code is the production version of the approved clickable preview (Version 12).

## What is inside

* **My dashboard**: Plan my day (Morning, Afternoon, Evening against an 8 hour day, with Plan for me), today, this week, notifications, approvals waiting, attendance and leave left, holidays and team leave, my projects, this month, policies to read, clients (admin), quick links, quick add.
* **Tasks**: Kanban board by default (drag a card to change status) or a list; filters for person, project, status, cadence, overdue and search. Task page with subtasks, dependencies, approval from a person, collaborators, comments with @mentions, time logs and history.
* **Projects**: recurring task rules (daily, weekly, monthly, quarterly, one time) with starter templates for SEO, Google Ads and PPC, Content and social, Web development and Client reporting. Project page with tasks by cadence, done each month, who contributed and how much.
* **Recurring engine**: creates tasks up to 7 days ahead, never twice for the same date. Daily routines skip holidays; other tasks move to the next working day.
* **People and roles**: Admin, Lead, Member. Admin adds leads and members; a lead adds members who then report to them. Profiles, people directory, team page.
* **Activity log** page: admin sees everyone, a lead sees themselves and every member, a member sees only themselves.
* **Office**: holiday calendar with weekly offs (Sundays plus 2nd and 4th Saturdays by default), leave requests approved only by the admin, restricted holidays (choose 2), attendance from sign in and sign out, HR and Leave policies with acknowledgement, tools list.
* **Credentials**: client and internal logins, encrypted, with Hidden, Login only or Full access per role; every reveal is logged.
* **Clients** (admin): stages, multi service pricing, payments, contacts, notes, move to live, domain, hosting and AMC renewals with reminder tasks 30 days before.
* **Notifications and announcements**: bell with unread count, notifications page, admin announcements shown as a banner.
* **Reports**: daily, weekly, monthly and quarterly with CSV download and Copy CSV.

## Requirements (dependencies)

On the server:

* Linux server with 1 to 2 vCPU, 2 GB RAM, 20 GB disk (Ubuntu 22.04 or 24.04)
* Node.js 20 or newer (comes with npm)
* Database: PostgreSQL 16 or newer
* Nginx with a free Let's Encrypt certificate for HTTPS, PM2 or systemd to keep the app running, cron for the daily job

Packages (installed by `npm ci`, exact versions in `package.json`): Next.js 15.5, React 19.2, Prisma 6.19 with the libSQL and PostgreSQL adapters, bcryptjs, jose, tsx, TypeScript 5. No paid service or outside API is needed. Fonts load from Google Fonts.

## Set up

```bash
npm ci
cp .env.example .env        # then fill in DATABASE_URL, AUTH_SECRET, CREDENTIALS_KEY, CRON_SECRET (see below)
```

Then create the database in one of two ways.

**Ready made database (recommended).** The `taskdesk_database` folder has dumps that match `prisma/schema.prisma`:

```bash
createdb taskdesk
psql -d taskdesk -f taskdesk_database/postgresql/taskdesk.sql        # live: tables, holidays, policies, settings, one admin
# or taskdesk_demo.sql to try the app with sample people, clients and history
```

The dumps start and end with `\restrict` lines that need psql 17.6 or newer (16.10 on version 16). With an older psql, delete those two lines first.

**Empty database.** `npx prisma db push` creates the tables and `npm run seed` adds the first admin, the holiday list, the starter policies and the settings. `npm run seed:demo` loads the sample data instead (never on the live server). Demo accounts (`admin`, `priya`, `karthik`, `divya`, `arun`, `meena`, `vignesh`, all `@searchengineers.in`) use the password `Demo@1234`.

```bash
npm run dev                 # http://localhost:3000
npm test                    # unit tests: recurring tasks, leave and attendance, permissions
npm run typecheck
```

The first admin signs in with the password from the seed (`ChangeMe@123` in the ready made database) and must set their own before anything else opens. The same applies to everyone added later with a temporary password.

## Run in production

```bash
npm ci
npm run build
pm2 start npm --name taskdesk -- start      # port 3000
```

Put Nginx in front for HTTPS and set `COOKIE_SECURE="true"`. `CREDENTIALS_KEY` is required in production: without it tool and credential passwords cannot be saved or shown.

**Daily job** (closes sessions left open, creates recurring tasks for the next 7 days, renewal reminders) at 00:05 India time:

```cron
5 0 * * * cd /var/www/taskdesk && npm run daily >> logs/daily.log 2>&1
```

On a Windows server run `powershell -ExecutionPolicy Bypass -File scripts\schedule-windows.ps1` once (as administrator); it registers the daily job and the backup in Task Scheduler. The job can also be called over HTTP: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://tasks.searchengineers.in/api/cron/generate` (the secret is accepted only in the header). If no schedule is set, the app runs the job at most every 30 minutes when someone opens it.

**Backups.** `npm run backup` writes `backups/taskdesk_<date>_<time>.dump` with `pg_dump` and removes dumps older than 14 days (`BACKUP_DIR`, `BACKUP_KEEP_DAYS` and `PG_BIN` change the folder, the days kept and where `pg_dump` is). Schedule it every night:

```cron
30 23 * * * cd /var/www/taskdesk && npm run backup >> logs/backup.log 2>&1
```

Restore with `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/<file>.dump`. Copy the backups off the server, and keep `CREDENTIALS_KEY` backed up separately: without it, saved passwords cannot be read.

The full go live checklist is in [docs/GO_LIVE.md](docs/GO_LIVE.md).

### PostgreSQL

The project uses the PostgreSQL provider and picks the PostgreSQL driver from the URL: `DATABASE_URL="postgresql://user:password@host:5432/taskdesk"`. Only `DATABASE_URL` is read; separate host, port or user variables are not used.

## Environment variables

| Name | Purpose |
| --- | --- |
| DATABASE_URL | Database location |
| AUTH_SECRET | Signs login sessions (64 random hex characters) |
| CREDENTIALS_KEY | 32 random bytes in base64; encrypts tool and credential passwords. Required in production; back it up |
| CRON_SECRET | Protects the daily job endpoint |
| APP_TIMEZONE | Asia/Kolkata; decides what "today" means |
| GENERATION_LOOKAHEAD_DAYS | Days of recurring tasks created ahead (7) |
| ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD | First admin created by the seed |
| SEED_DEMO | true only for a demo database |
| COOKIE_SECURE | true behind HTTPS |

## HTTP endpoints

Every button in the app uses Next.js server actions (in `src/app/actions`), so only these HTTP routes exist:

| Endpoint | Method | Purpose | Access |
| --- | --- | --- | --- |
| /api/cron/generate | POST or GET | Daily job: close open sessions, create recurring tasks, renewal reminders | Bearer CRON_SECRET |
| /api/notifications/count | GET | Unread count for the bell | Signed in |
| /api/reports/csv | GET | Report export (period, anchor, project, person) | Signed in, same rules as Reports |
| /api/attendance/csv | GET | Attendance export (month, person) | Signed in; members get only their own |
| /api/health | GET | App and database check for monitoring | Public |

## Code layout

| Path | Holds |
| --- | --- |
| prisma/schema.prisma | The data model (30 tables) |
| prisma/seed.ts, prisma/demo.json | Seed and demo data |
| scripts/daily.ts, scripts/backup.ts, scripts/schedule-windows.ps1 | Daily job, database backup, Windows Task Scheduler setup |
| tests | Unit tests (`npm test`) |
| src/lib | Business logic: dates, calendar, permissions, recurrence engine, generator, task status rules, logging, notifications, encryption |
| src/app/(app) | Signed in pages, one folder per section |
| src/app/actions | Server actions per module; every write checks permissions on the server |
| src/components | Shared UI: shell, task rows, popups, password box, board |
| docs/CONVENTIONS.md | How the code is organised, how to add a page or action, and the decisions taken |
| docs/GO_LIVE.md | Go live checklist |

The full logic behind every module (roles, recurrence, holidays, leave, approvals, notifications, clients and renewals) is in the TaskDesk Developer Guide.
