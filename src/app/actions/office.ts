"use server";

import { prisma } from "@/lib/db";
import { act, notify, notifyAdmins, notifyMany } from "@/lib/log";
import { canApproveLeave, canSeeToolPassword, isAdmin } from "@/lib/permissions";
import { HTYPE, LSTATUS, LTYPE, TOOLCATS } from "@/lib/constants";
import { fmtDate, isDayKey, todayKey } from "@/lib/dates";
import { isWeekend, leaveDays, offLabel } from "@/lib/calendar";
import { loadCal, saveSetting } from "@/lib/model";
import { rescheduleAll } from "@/lib/generator";
import { decrypt, encrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth";
import { bool, int, ok, refuse, run, str, type Result } from "@/lib/action";
import { PWVIS, SATRULE } from "@/components/office/shared";

const adminOnly = (me: { id: string; role: string }) => { if (!isAdmin(me)) refuse("Only the admin can do this."); };

// ============ calendar ============

export async function addHoliday(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const date = str(fd, "date"), name = str(fd, "name"), type = HTYPE[str(fd, "type")] ? str(fd, "type") : "PUBLIC";
    if (!isDayKey(date) || !name) refuse("Enter a date and a name");
    await prisma.$transaction(async (tx) => {
      await tx.holiday.create({ data: { date, name, type } });
      await act(tx, me.id, "added holiday", `${name}, ${fmtDate(date)}`);
    });
    await rescheduleAll();
    return ok("Holiday added. Upcoming recurring tasks now skip or move around it", { href: `/calendar?month=${date.slice(0, 7)}` });
  });
}

export async function removeHoliday(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const h = await prisma.holiday.findUnique({ where: { id: str(fd, "id") } });
    if (!h) refuse("That holiday was already removed");
    await prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id: h!.id } });
      await act(tx, me.id, "removed holiday", `${h!.name}, ${fmtDate(h!.date)}`);
    });
    await rescheduleAll();
    return ok("Holiday removed. Upcoming recurring tasks updated");
  });
}

export async function saveWeekOff(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const sundayOff = bool(fd, "sun");
    const satRule = SATRULE[str(fd, "sat")] ? str(fd, "sat") : "SECOND_FOURTH";
    const cal = await loadCal();
    await prisma.$transaction(async (tx) => {
      await saveSetting("sundayOff", sundayOff, tx);
      await saveSetting("satRule", satRule, tx);
      await act(tx, me.id, "changed weekly off", offLabel({ ...cal.settings, sundayOff, satRule }));
    });
    await rescheduleAll();
    return ok("Weekly off saved. Recurring tasks updated");
  });
}

// ============ leave ============

const range = (from: string, to: string) => `${fmtDate(from)}${to !== from ? " to " + fmtDate(to) : ""}`;

export async function requestLeave(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const type = str(fd, "type");
    if (!LTYPE[type] || type === "RH") refuse("Pick a leave type");
    const from = str(fd, "from"), to = str(fd, "to"), half = bool(fd, "half"), reason = str(fd, "reason");
    if (!isDayKey(from) || !isDayKey(to)) refuse("Pick the dates");
    if (to < from) refuse("The end date is before the start date");
    if (half && from !== to) refuse("Half day leave needs the same start and end date");
    if (!reason) refuse("Add a short reason");
    const cal = await loadCal();
    const days = leaveDays(cal, { half, from, to });
    if (!days) refuse("Those dates are all weekends or holidays");
    const clash = await prisma.leave.count({ where: { userId: me.id, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: to }, toDate: { gte: from } } });
    if (clash) refuse("You already have leave on some of these dates");
    const allow = cal.settings.allow[type];
    if (allow) {
      const yr = from.slice(0, 4);
      const rows = await prisma.leave.findMany({ where: { userId: me.id, type, status: { in: ["APPROVED", "PENDING"] }, fromDate: { startsWith: yr } } });
      const usedPlus = rows.reduce((a, x) => a + leaveDays(cal, { half: x.half, from: x.fromDate, to: x.toDate }), 0) + days;
      if (usedPlus > allow) refuse(`Not enough ${LTYPE[type].toLowerCase()} left. Try comp off or unpaid leave`);
    }
    const admin = isAdmin(me);
    await prisma.$transaction(async (tx) => {
      await tx.leave.create({ data: { userId: me.id, type, fromDate: from, toDate: to, half, reason, status: admin ? "APPROVED" : "PENDING", decidedById: admin ? me.id : null, decidedAt: admin ? new Date() : null } });
      if (!admin) await notifyAdmins(tx, "LEAVE", `${me.name} requested ${LTYPE[type].toLowerCase()}`, `${range(from, to)}: ${reason}`, "/leave", me.id);
      await act(tx, me.id, "requested leave", `${LTYPE[type]}, ${days} ${days === 1 ? "day" : "days"}`);
    });
    return ok(admin ? "Leave recorded" : "Leave request sent for approval");
  });
}

export async function decideLeave(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const status = str(fd, "s");
    if (status !== "APPROVED" && status !== "REJECTED") refuse("Pick approve or reject");
    const l = await prisma.leave.findUnique({ where: { id: str(fd, "id") }, include: { user: { select: { name: true } } } });
    if (!l) refuse("That leave request was not found");
    if (!canApproveLeave(me, l!.userId)) refuse("You cannot decide your own leave");
    if (l!.status !== "PENDING") refuse("This request was already decided");
    await prisma.$transaction(async (tx) => {
      await tx.leave.update({ where: { id: l!.id }, data: { status, decidedById: me.id, decidedAt: new Date() } });
      await notify(tx, l!.userId, "LEAVE", `Your ${LTYPE[l!.type].toLowerCase()} was ${status === "APPROVED" ? "approved" : "rejected"}`, range(l!.fromDate, l!.toDate), "/leave", me.id);
      await act(tx, me.id, status === "APPROVED" ? "approved leave" : "rejected leave", `${l!.user.name}, ${LTYPE[l!.type]}`);
    });
    return ok(`${LSTATUS[status]} for ${l!.user.name}`);
  });
}

export async function cancelLeave(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const l = await prisma.leave.findUnique({ where: { id: str(fd, "id") } });
    if (!l || l.userId !== me.id) refuse("You can only cancel your own leave");
    if (!(l!.status === "PENDING" || (l!.status === "APPROVED" && l!.fromDate > todayKey()))) refuse("This leave can no longer be cancelled");
    await prisma.$transaction(async (tx) => {
      await tx.leave.update({ where: { id: l!.id }, data: { status: "CANCELLED" } });
      await act(tx, me.id, "cancelled leave", `${LTYPE[l!.type]}, ${fmtDate(l!.fromDate)}`);
    });
    return ok("Leave request cancelled");
  });
}

export async function takeRestrictedHoliday(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const d = str(fd, "d");
    const h = await prisma.holiday.findFirst({ where: { date: d, type: "RESTRICTED" } });
    if (!h) refuse("That restricted holiday was not found");
    if (d <= todayKey()) refuse("That day has passed");
    const cal = await loadCal();
    if (isWeekend(cal, d)) refuse("That day falls on a weekly off");
    const taken = await prisma.leave.findMany({ where: { userId: me.id, type: "RH", status: { in: ["APPROVED", "PENDING"] }, fromDate: { startsWith: d.slice(0, 4) } } });
    if (taken.some((l) => l.fromDate === d)) refuse("You already picked this day");
    if (taken.length >= cal.settings.rhLimit) refuse(`You can take up to ${cal.settings.rhLimit} restricted holidays a year`);
    const clash = await prisma.leave.count({ where: { userId: me.id, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: d }, toDate: { gte: d } } });
    if (clash) refuse("You already have leave on this date");
    const admin = isAdmin(me);
    await prisma.$transaction(async (tx) => {
      await tx.leave.create({ data: { userId: me.id, type: "RH", fromDate: d, toDate: d, half: false, reason: h!.name, status: admin ? "APPROVED" : "PENDING", decidedById: admin ? me.id : null, decidedAt: admin ? new Date() : null } });
      if (!admin) await notifyAdmins(tx, "LEAVE", `${me.name} requested a restricted holiday`, `${h!.name}, ${fmtDate(d)}`, "/leave", me.id);
      await act(tx, me.id, "requested leave", `Restricted holiday, ${h!.name}`);
    });
    return ok(admin ? "Restricted holiday recorded" : "Restricted holiday sent for approval");
  });
}

export async function saveAllowances(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const { settings } = await loadCal();
    const allow: Record<string, number> = { ...settings.allow };
    for (const k of Object.keys(allow)) { const v = int(fd, k); if (v !== null) allow[k] = Math.min(60, Math.max(0, v)); }
    const rv = int(fd, "RH");
    const rhLimit = rv === null ? settings.rhLimit : Math.min(10, Math.max(0, rv));
    await prisma.$transaction(async (tx) => {
      await saveSetting("allow", allow, tx);
      await saveSetting("rhLimit", rhLimit, tx);
      await act(tx, me.id, "updated leave allowances");
    });
    return ok("Allowances saved");
  });
}

// ============ policies ============

export async function ackPolicy(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const pol = await prisma.policy.findUnique({ where: { id: str(fd, "id") } });
    if (!pol) refuse("That policy was not found");
    const today = todayKey();
    await prisma.$transaction(async (tx) => {
      await tx.policyAck.upsert({ where: { policyId_userId: { policyId: pol!.id, userId: me.id } }, update: { ackedOn: today }, create: { policyId: pol!.id, userId: me.id, ackedOn: today } });
      await act(tx, me.id, "read policy", pol!.title);
    });
    return ok("Thank you. Marked as read");
  });
}

export async function savePolicy(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const pol = await prisma.policy.findUnique({ where: { id: str(fd, "id") } });
    if (!pol) refuse("That policy was not found");
    const title = str(fd, "title") || pol!.title, body = String(fd.get("body") ?? ""), reset = bool(fd, "reset"), today = todayKey();
    if (!body.trim()) refuse("Write the policy text");
    await prisma.$transaction(async (tx) => {
      await tx.policy.update({ where: { id: pol!.id }, data: { title, body, updatedById: me.id, updatedOn: today } });
      if (reset) {
        await tx.policyAck.deleteMany({ where: { policyId: pol!.id } });
        await tx.policyAck.create({ data: { policyId: pol!.id, userId: me.id, ackedOn: today } });
        const everyone = await tx.user.findMany({ where: { active: true }, select: { id: true } });
        await notifyMany(tx, everyone.map((x) => x.id), "POLICY", `${title} was updated`, "Please read it and confirm.", `/policies?id=${pol!.id}`, me.id);
      }
      await act(tx, me.id, "updated policy", title);
    });
    return ok(reset ? "Policy saved. Everyone will be asked to read it again" : "Policy saved");
  });
}

export async function addPolicy(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const title = str(fd, "title"), body = String(fd.get("body") ?? ""), today = todayKey();
    if (!title || !body.trim()) refuse("Enter a title and the policy text");
    const last = await prisma.policy.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const id = await prisma.$transaction(async (tx) => {
      const pol = await tx.policy.create({ data: { title, body, sortOrder: (last?.sortOrder ?? 0) + 1, updatedById: me.id, updatedOn: today } });
      await tx.policyAck.create({ data: { policyId: pol.id, userId: me.id, ackedOn: today } });
      const everyone = await tx.user.findMany({ where: { active: true }, select: { id: true } });
      await notifyMany(tx, everyone.map((x) => x.id), "POLICY", `New policy: ${title}`, "Please read it and confirm.", `/policies?id=${pol.id}`, me.id);
      await act(tx, me.id, "updated policy", title);
      return pol.id;
    });
    return ok("Policy added", { href: `/policies?id=${id}` });
  });
}

export async function removePolicy(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const pol = await prisma.policy.findUnique({ where: { id: str(fd, "id") } });
    if (!pol) refuse("That policy was already deleted");
    if ((await prisma.policy.count()) <= 1) refuse("Keep at least one policy");
    await prisma.$transaction(async (tx) => {
      await tx.policy.delete({ where: { id: pol!.id } });
      await act(tx, me.id, "deleted policy", pol!.title);
    });
    return ok("Policy deleted", { href: "/policies" });
  });
}

// ============ tools ============

function toolFrom(fd: FormData) {
  const name = str(fd, "name");
  if (!name) refuse("Enter the tool name");
  const category = TOOLCATS.includes(str(fd, "category")) ? str(fd, "category") : "Others";
  const url = str(fd, "url");
  if (url && !/^https?:\/\//i.test(url)) refuse("The login link must start with https://");
  return {
    name, category, url, username: str(fd, "login"), twofa: str(fd, "twofa"),
    plan: str(fd, "plan") === "PAID" ? "PAID" : "FREE",
    access: ["SHARED", "OWN", "FREE"].includes(str(fd, "access")) ? str(fd, "access") : "SHARED",
    visibility: PWVIS[str(fd, "vis")] ? str(fd, "vis") : "ALL",
    notes: str(fd, "notes"),
  };
}

export async function addTool(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const t = toolFrom(fd), password = String(fd.get("password") ?? "");
    if (t.access === "SHARED" && !password) refuse("Add the shared password, or pick Own login or Free, no login");
    await prisma.$transaction(async (tx) => {
      // A password is kept only for a shared login.
      await tx.tool.create({ data: { ...t, passwordEnc: t.access === "SHARED" ? encrypt(password) : "" } });
      await act(tx, me.id, "added tool", t.name);
    });
    return ok("Tool added", { href: "/tools" });
  });
}

export async function editTool(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const ex = await prisma.tool.findUnique({ where: { id: str(fd, "id") } });
    if (!ex) refuse("That tool was not found");
    const t = toolFrom(fd), password = String(fd.get("password") ?? ""), clear = bool(fd, "clearpw");
    if (t.access === "SHARED" && !password && (clear || !ex!.passwordEnc)) refuse("Add the shared password, or pick Own login or Free, no login");
    const pw = t.access !== "SHARED" ? { passwordEnc: "" } : password ? { passwordEnc: encrypt(password) } : {};
    await prisma.$transaction(async (tx) => {
      await tx.tool.update({ where: { id: ex!.id }, data: { ...t, ...pw } });
      await act(tx, me.id, "updated tool", t.name);
    });
    return ok("Tool saved");
  });
}

export async function removeTool(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const ex = await prisma.tool.findUnique({ where: { id: str(fd, "id") } });
    if (!ex) refuse("That tool was already removed");
    await prisma.$transaction(async (tx) => {
      await tx.tool.delete({ where: { id: ex!.id } });
      await act(tx, me.id, "removed tool", ex!.name);
    });
    return ok("Tool removed");
  });
}

/** Returns a tool password after checking access, and logs the view or the copy. Bind the tool id on the page. */
export async function revealToolPassword(id: string, purpose: "view" | "copy" = "view"): Promise<{ value?: string; error?: string }> {
  const me = await getCurrentUser();
  if (!me) return { error: "Please sign in again." };
  const t = await prisma.tool.findUnique({ where: { id } });
  if (!t || !t.passwordEnc) return { error: "This tool has no saved password" };
  if (!canSeeToolPassword(me, t)) return { error: "Ask the admin for this password" };
  try {
    const value = decrypt(t.passwordEnc);
    await prisma.credentialView.create({ data: { toolId: t.id, userId: me.id, name: t.name, action: purpose === "copy" ? "copied password for" : "viewed" } });
    return { value };
  } catch (e) {
    console.error(e);
    return { error: "This password could not be read. Ask the admin to save it again." };
  }
}
