// npm run seed        creates the first admin, the holiday list, starter HR and Leave policies and default settings.
// npm run seed:demo   also loads demo people, clients, projects and five weeks of history (password Demo@1234).
// Safe to run again: it only adds what is missing.
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { DEFAULT_SETTINGS, HOLIDAY_LIST } from "../src/lib/constants";
import { addK, diffK, fromLocal, todayKey } from "../src/lib/dates";
import { encrypt } from "../src/lib/crypto";
import { generate, renewalReminders } from "../src/lib/generator";
import { closeStaleSessions } from "../src/lib/sessions";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const demoFile = path.join(__dirname, "demo.json");
// "npm run seed:demo" passes --demo: works on Windows, macOS and Linux (no inline env variable needed).
if (process.argv.includes("--demo")) process.env.SEED_DEMO = "true";

async function base(demo: Any) {
  // first admin
  const email = (process.env.ADMIN_EMAIL || "admin@searchengineers.in").toLowerCase();
  if (!(await prisma.user.findUnique({ where: { email } }))) {
    const pw = process.env.ADMIN_PASSWORD || "ChangeMe@123";
    await prisma.user.create({ data: { id: process.env.SEED_DEMO === "true" ? "u_admin" : undefined, name: process.env.ADMIN_NAME || "Admin", email, role: "ADMIN", title: "Operations Head", passwordHash: await bcrypt.hash(pw, 12), mustChangePassword: process.env.SEED_DEMO !== "true" } });
    console.log("Created admin", email);
  }
  // holidays
  if (!(await prisma.holiday.count())) {
    await prisma.holiday.createMany({ data: HOLIDAY_LIST.map(([date, name, type]) => ({ date, name, type })) });
    console.log("Added", HOLIDAY_LIST.length, "holidays");
  }
  // settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: JSON.stringify(value) } });
  }
  // starter policies
  if (!(await prisma.policy.count())) {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    let i = 0;
    for (const p of demo.policies as Any[]) {
      await prisma.policy.create({ data: { id: p.id, title: p.title, body: p.body, sortOrder: i++, updatedById: admin?.id || null, updatedOn: todayKey() } });
    }
    console.log("Added starter HR and Leave policies");
  }
}

async function demoData(demo: Any) {
  if (await prisma.task.count()) { console.log("Tasks already exist, skipping demo data"); return; }
  const today = todayKey();
  const shift = Math.round(diffK(today, demo.today) / 7) * 7; // whole weeks keep weekdays right
  const K = (k: string | null | undefined) => (k ? addK(k, shift) : null);
  const KS = (k: string | null | undefined) => (k ? addK(k, shift) : "");
  const D = (s: string | null | undefined) => (s ? fromLocal(addK(s.slice(0, 10), shift), s.slice(11, 16) || "00:00") : null);
  const hash = await bcrypt.hash("Demo@1234", 12);
  // A demo person whose email already has an account (such as the first admin) keeps that account's id.
  for (const u of demo.users as Any[]) {
    const ex = await prisma.user.findUnique({ where: { email: u.email } });
    if (ex && ex.id !== u.id) demo = JSON.parse(JSON.stringify(demo).replaceAll(`"${u.id}"`, `"${ex.id}"`));
  }

  for (const u of demo.users as Any[]) {
    const exists = await prisma.user.findFirst({ where: { OR: [{ id: u.id }, { email: u.email }] } });
    if (exists) { await prisma.user.update({ where: { id: exists.id }, data: { name: u.name, title: u.title, phone: u.phone, location: u.location, empType: u.emp } }); continue; }
    await prisma.user.create({ data: { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, phone: u.phone, location: u.location, empType: u.emp, active: u.active, passwordHash: hash } });
  }
  for (const u of demo.users as Any[]) if (u.reportsTo) await prisma.user.updateMany({ where: { id: u.id }, data: { reportsToId: u.reportsTo } });

  for (const c of demo.clients as Any[]) {
    await prisma.client.create({
      data: {
        id: c.id, name: c.name, industry: c.industry, stage: c.stage, ownerId: c.ownerId, website: c.website || "", city: c.city || "", address: c.address || "", gst: c.gst || "",
        pocName: c.poc?.name || "", pocRole: c.poc?.role || "", pocPhone: c.poc?.phone || "", pocEmail: c.poc?.email || "", comms: (c.comms || []).join(","), onboardedOn: K(c.onboardedOn), contractRenewal: K(c.renewal), notes: c.notes || "",
        contacts: { create: (c.contacts || []).map((k: Any) => ({ name: k.name, role: k.role || "", phone: k.phone || "", email: k.email || "" })) },
        services: { create: (c.services || []).map((s: Any) => ({ id: s.id, line: s.line, type: s.type, price: s.price, cycle: s.cycle, startDate: KS(s.start), completedDate: KS(s.completed), item: s.item || "", provider: s.provider || "", renewDate: KS(s.renew) })) },
        payments: { create: (c.payments || []).map((p: Any) => ({ amount: p.amount, receivedOn: KS(p.on), note: p.note || "" })) },
        notesLog: { create: (c.notesLog || []).map((n: Any) => ({ byId: n.by, on: KS(n.on), text: n.text })) },
      },
    });
  }
  for (const p of demo.projects as Any[]) {
    await prisma.project.create({
      data: {
        id: p.id, name: p.name, clientId: p.clientId, clientLabel: p.clientId ? null : p.client || null, industry: p.industry, line: p.line, website: p.website || null, description: p.description || "", status: p.status, leadId: p.leadId,
        pocName: p.poc?.name, pocRole: p.poc?.role, pocPhone: p.poc?.phone, pocEmail: p.poc?.email, comms: (p.comms || []).join(","), startDate: K(addK(demo.today, -35)),
        members: { create: (p.members as string[]).map((userId) => ({ userId })) },
      },
    });
  }
  for (const r of demo.rules as Any[]) {
    await prisma.recurringRule.create({ data: { id: r.id, projectId: r.projectId, title: r.title, description: r.description || "", category: r.category, frequency: r.frequency, weekday: r.weekday, monthDay: r.monthDay, skipWeekends: r.skipWeekends, dueOffsetDays: r.dueOffsetDays || 0, startDate: KS(r.startDate), endDate: K(r.endDate), assigneeId: r.assigneeId, priority: r.priority, estimate: r.estimate, checklist: JSON.stringify(r.checklist || []), active: r.active, generatedThrough: K(r.gen) } });
  }
  const tasks = demo.tasks as Any[];
  for (const t of tasks) {
    await prisma.task.create({
      data: {
        id: t.id, title: t.title, description: t.description || "", projectId: t.projectId, assigneeId: t.assigneeId, createdById: t.createdById, ruleId: t.ruleId, occurrenceDate: K(t.occ), renewKey: t.renewKey || null, frequency: t.frequency, category: t.category, status: t.status, priority: t.priority,
        dueDate: K(t.dueDate), estimate: t.estimate, spentMinutes: t.spent || 0, completedAt: D(t.completedAt), cancelledAt: D(t.cancelledAt), createdAt: D((t.createdOn || demo.today) + " 09:30")!,
        subtasks: { create: (t.subtasks || []).map((s: Any, i: number) => ({ id: s.id, title: s.title, assigneeId: s.assigneeId, done: s.done, sortOrder: i })) },
        collaborators: { create: (t.collab || []).map((userId: string) => ({ userId })) },
      },
    });
  }
  for (const t of tasks) {
    for (const d of t.deps || []) await prisma.taskDependency.create({ data: { taskId: t.id, dependsOnId: d } });
    for (const a of t.approvals || []) await prisma.taskApproval.create({ data: { id: a.id, taskId: t.id, approverId: a.userId, requestedById: a.by, note: a.note || "", status: a.status, createdAt: D(a.at) || new Date() } });
  }
  await prisma.comment.createMany({ data: (demo.comments as Any[]).map((c) => ({ taskId: c.taskId, userId: c.userId, body: c.body, createdAt: D(c.at)! })) });
  await prisma.timeLog.createMany({ data: (demo.timelogs as Any[]).map((l) => ({ taskId: l.taskId, userId: l.userId, minutes: l.minutes, workDate: KS(l.on), note: l.note || "" })) });
  await prisma.activity.createMany({ data: (demo.activities as Any[]).filter((a) => !a.taskId || tasks.some((t) => t.id === a.taskId)).map((a) => ({ userId: a.userId, action: a.action, detail: a.detail || "", taskId: a.taskId, projectId: a.projectId, createdAt: D(a.at)! })) });
  await prisma.leave.createMany({ data: (demo.leaves as Any[]).map((l) => ({ userId: l.userId, type: l.type, fromDate: l.type === "RH" ? l.from : KS(l.from), toDate: l.type === "RH" ? l.to : KS(l.to), half: !!l.half, reason: l.reason || "", status: l.status, decidedById: l.decidedBy, decidedAt: l.decidedBy ? D(l.at) : null, createdAt: D(l.at)! })) });
  await prisma.session.createMany({ data: (demo.sessions as Any[]).filter((s) => KS(s.in.slice(0, 10)) < today).map((s) => ({ userId: s.userId, day: KS(s.in.slice(0, 10)), signedInAt: D(s.in)!, signedOutAt: D(s.out) })) });
  for (const v of demo.vault as Any[]) {
    await prisma.credential.create({ data: { scope: v.scope, clientId: v.clientId, name: v.name, url: v.url || "", username: v.username || "", passwordEnc: encrypt(v.password || ""), notes: v.notes || "", leadAccess: v.access?.LEAD || "NONE", memberAccess: v.access?.MEMBER || "NONE", changedOn: KS(v.changedOn) } });
  }
  for (const t of demo.tools as Any[]) {
    await prisma.tool.create({ data: { name: t.name, category: t.category, url: t.url || "", username: t.login || "", passwordEnc: encrypt(t.password || ""), twofa: t.twofa || "", plan: t.plan, access: t.password ? "SHARED" : "OWN", visibility: t.vis || "ALL", notes: t.notes || "" } });
  }
  for (const p of demo.policies as Any[]) for (const [userId, on] of Object.entries(p.acks || {})) await prisma.policyAck.upsert({ where: { policyId_userId: { policyId: p.id, userId } }, update: {}, create: { policyId: p.id, userId, ackedOn: KS(on as string) } });
  for (const a of demo.announcements as Any[]) {
    await prisma.announcement.create({ data: { id: a.id, title: a.title, body: a.body, byId: a.by, createdAt: D(a.at)! } });
    await prisma.announcementRead.create({ data: { announcementId: a.id, userId: a.by } });
  }
  const link = (n: Any) => (n.kind === "ANNOUNCE" && demo.announcements[0] ? "ann:" + demo.announcements[0].id : n.link?.name === "task" ? `/tasks/${n.link.id}` : n.link?.name === "leave" ? "/leave" : n.link?.name === "notifications" ? "/notifications" : "");
  await prisma.notification.createMany({ data: (demo.notifs as Any[]).filter((n) => n.kind !== "RENEWAL").map((n) => ({ userId: n.userId, kind: n.kind, title: n.title, body: n.body || "", link: link(n), fromId: n.from, readAt: n.read ? D(n.at) : null, createdAt: D(n.at)! })) });

  await closeStaleSessions();
  const made = await generate();
  const rem = await renewalReminders();
  console.log(`Demo data loaded (dates moved ${shift} days). ${made} upcoming tasks, ${rem} renewal reminders. Demo password: Demo@1234`);
}

async function main() {
  const demo = JSON.parse(readFileSync(demoFile, "utf8"));
  await base(demo);
  if (process.env.SEED_DEMO === "true") await demoData(demo);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
