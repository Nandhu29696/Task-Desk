# TaskDesk go live checklist

Work through this list once on the live server. Each step says how to check it.

## 1. Settings (`.env`)

| Setting | Value | Check |
| --- | --- | --- |
| DATABASE_URL | `postgresql://USER:PASSWORD@HOST:5432/taskdesk` | `npm run backup` writes a file |
| AUTH_SECRET | 64 random hex characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Sign in works |
| CREDENTIALS_KEY | 32 random bytes in base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | A tool password can be saved and shown |
| CRON_SECRET | A long random string | `curl -X POST -H "Authorization: Bearer <secret>" https://<host>/api/cron/generate` answers `"ok":true` |
| COOKIE_SECURE | `true` once the site is served over HTTPS | Sign in still works over HTTPS |
| APP_TIMEZONE | `Asia/Kolkata` | The dashboard shows today's date |

Keep a copy of `CREDENTIALS_KEY` outside the server (for example in the company password manager). Never use the demo key from the database README on the live server. Never change `CREDENTIALS_KEY` once passwords are saved: they could no longer be read.

## 2. Database

1. Create the database and load `taskdesk_database/postgresql/taskdesk.sql` (see the README).
2. `npm run build`, then start the app (`pm2 start npm --name taskdesk -- start`).
3. Open `/api/health`: it answers `{"ok":true}`.

## 3. Scheduled jobs

| Job | When | Linux (cron) | Windows |
| --- | --- | --- | --- |
| Daily job | 00:05 | `5 0 * * * cd /var/www/taskdesk && npm run daily >> logs/daily.log 2>&1` | `scripts\schedule-windows.ps1` (run once as administrator) |
| Backup | 23:30 | `30 23 * * * cd /var/www/taskdesk && npm run backup >> logs/backup.log 2>&1` | registered by the same script |

Check the next morning: `logs/daily.log` has a line with `daily job`, and `backups/` has a new `.dump` file. Once a month, restore the latest backup into a spare database and open the app on it.

## 4. First sign in and handover

1. Sign in as `admin@searchengineers.in` with `ChangeMe@123`. TaskDesk opens My account and asks for a new password first.
2. On People, edit the admin's name, position and contact details.
3. Add the leads (People, Add lead or member). Each lead then adds their members. Share temporary passwords privately; everyone sets their own at first sign in.
4. Check the holiday list and the weekly off on Calendar, and the leave allowances on Leave.
5. Add clients, move them to live, and check the recurring tasks on each project.
6. Read the two starter policies and edit them to match the company's rules.

## 5. After go live

* Watch `logs/daily.log` for the first week.
* When someone leaves, deactivate them on People and pick who takes over their work.
* Back up `CREDENTIALS_KEY` again whenever the server is rebuilt.
