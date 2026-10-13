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
* **Reports**: daily, weekly, monthly and quarterly with CSV download.

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
cp .env.example .env        # then fill in AUTH_SECRET, CREDENTIALS_KEY, CRON_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npx prisma db push          # creates the tables
npm run seed                # first admin, holiday list, starter HR and Leave policies, settings
npm run dev                 # http://localhost:3000
```

To try it with sample data first, run `npm run seed:demo` on an empty database instead of `npm run seed`. Demo accounts (`admin`, `priya`, `karthik`, `divya`, `arun`, `meena`, `vignesh`, all `@searchengineers.in`) use the password `Demo@1234`. Never load demo data on the live server.

## Run in production

```bash
npm ci
npx prisma db push
npm run seed
npm run build
pm2 start npm --name taskdesk -- start      # port 3000
```

Put Nginx in front for HTTPS and set `COOKIE_SECURE="true"`. Add the daily job at 00:05 India time:

```cron
5 0 * * * cd /var/www/taskdesk && npm run daily >> daily.log 2>&1
```

or call the endpoint: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://tasks.searchengineers.in/api/cron/generate`. If no cron is set, the app also runs the job at most every 30 minutes when someone opens it.

Back up the database every day and keep 14 days. Keep `CREDENTIALS_KEY` backed up separately: without it, saved passwords cannot be read.

### PostgreSQL

Set `DATABASE_URL="postgresql://user:password@host:5432/taskdesk"` in `.env`, then run `npx prisma db push` and `npm run seed`. The project is already configured with the PostgreSQL provider and picks the PostgreSQL driver from the URL.

## Environment variables

| Name | Purpose |
| --- | --- |
| DATABASE_URL | Database location |
| AUTH_SECRET | Signs login sessions (64 random hex characters) |
| CREDENTIALS_KEY | 32 random bytes in base64; encrypts tool and credential passwords |
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
| src/lib | Business logic: dates, calendar, permissions, recurrence engine, generator, task status rules, logging, notifications, encryption |
| src/app/(app) | Signed in pages, one folder per section |
| src/app/actions | Server actions per module; every write checks permissions on the server |
| src/components | Shared UI: shell, task rows, popups, password box, board |
| docs/CONVENTIONS.md | How the code is organised and how to add a page or action |

The full logic behind every module (roles, recurrence, holidays, leave, approvals, notifications, clients and renewals) is in the TaskDesk Developer Guide.
