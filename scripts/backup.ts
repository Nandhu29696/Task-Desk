// Daily database backup: npm run backup
// Writes backups/taskdesk_<date>_<time>.dump (pg_dump custom format) and removes dumps older than 14 days.
// Restore with: pg_restore --clean --if-exists --no-owner -d <database url> <file>
// Optional settings: BACKUP_DIR (folder), BACKUP_KEEP_DAYS (default 14), PG_BIN (folder that holds pg_dump).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = path.join(process.cwd(), ".env");
  if (existsSync(env)) {
    const line = readFileSync(env, "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
    if (line) return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  }
  throw new Error("DATABASE_URL is not set.");
}

/** pg_dump from PG_BIN, the PATH, or the newest PostgreSQL install on Windows. */
function pgDump() {
  const exe = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, exe);
  if (spawnSync(exe, ["--version"]).status === 0) return exe;
  const root = "C:\\Program Files\\PostgreSQL";
  if (process.platform === "win32" && existsSync(root)) {
    const versions = readdirSync(root).filter((v) => existsSync(path.join(root, v, "bin", exe))).sort((a, b) => Number(b) - Number(a));
    if (versions.length) return path.join(root, versions[0], "bin", exe);
  }
  throw new Error("pg_dump was not found. Install the PostgreSQL client tools or set PG_BIN.");
}

const url = databaseUrl().split("?")[0];
if (!url.startsWith("postgres")) throw new Error("Backups need a PostgreSQL DATABASE_URL.");
const dir = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 14);
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
const file = path.join(dir, `taskdesk_${stamp}.dump`);
const r = spawnSync(pgDump(), ["--format=custom", "--no-owner", "--file", file, url], { stdio: ["ignore", "inherit", "inherit"] });
if (r.status !== 0) { console.error("Backup failed"); process.exit(1); }
console.log(new Date().toISOString(), "backup written", file, Math.round(statSync(file).size / 1024) + " KB");

const cutoff = Date.now() - keepDays * 864e5;
for (const f of readdirSync(dir)) {
  if (!/^taskdesk_.*\.dump$/.test(f)) continue;
  const full = path.join(dir, f);
  if (statSync(full).mtimeMs < cutoff) { unlinkSync(full); console.log("removed old backup", f); }
}
