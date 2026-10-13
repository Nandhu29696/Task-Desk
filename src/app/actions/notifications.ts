"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { act } from "@/lib/log";
import { isAdmin } from "@/lib/permissions";
import { ok, refuse, run, str, type Result } from "@/lib/action";

export async function readAll(_p: Result, _fd: FormData): Promise<Result> {
  return run(async (me) => {
    await prisma.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
    return ok("All caught up");
  });
}

export async function toggleRead(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const n = await prisma.notification.findFirst({ where: { id: str(fd, "id"), userId: me.id } });
    if (!n) refuse("Notification not found");
    await prisma.notification.update({ where: { id: n!.id }, data: { readAt: n!.readAt ? null : new Date() } });
    return ok(n!.readAt ? "Marked as unread" : "Marked as read");
  });
}

/** Marks the notification read and opens what it points to. */
export async function openNotification(fd: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const n = await prisma.notification.findFirst({ where: { id: String(fd.get("id") || ""), userId: me.id } });
  if (!n) redirect("/notifications");
  if (!n.readAt) await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  if (n.kind === "ANNOUNCE" && n.link.startsWith("ann:")) {
    await prisma.announcementRead.upsert({ where: { announcementId_userId: { announcementId: n.link.slice(4), userId: me.id } }, update: {}, create: { announcementId: n.link.slice(4), userId: me.id } });
    redirect("/notifications?tab=ANNOUNCE");
  }
  redirect(n.link && n.link.startsWith("/") ? n.link : "/notifications");
}

/** Hides the announcement banner for this person and marks its notification read. */
export async function readAnnouncement(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const id = str(fd, "id");
    if (!(await prisma.announcement.findUnique({ where: { id } }))) refuse("Announcement not found");
    await prisma.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId: me.id } }, update: {}, create: { announcementId: id, userId: me.id } });
    await prisma.notification.updateMany({ where: { userId: me.id, kind: "ANNOUNCE", link: "ann:" + id, readAt: null }, data: { readAt: new Date() } });
    return ok("Marked as read");
  });
}

/** Admin shares a company update: one notification per active person and a banner until they read it. */
export async function shareAnnouncement(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    if (!isAdmin(me)) refuse("Only the admin can share announcements.");
    const title = str(fd, "title"), body = str(fd, "body");
    if (!title || !body) refuse("Add a title and the message.");
    await prisma.$transaction(async (tx) => {
      const a = await tx.announcement.create({ data: { title, body, byId: me.id } });
      await tx.announcementRead.create({ data: { announcementId: a.id, userId: me.id } });
      const people = await tx.user.findMany({ where: { active: true, id: { not: me.id } }, select: { id: true } });
      if (people.length) await tx.notification.createMany({ data: people.map((p) => ({ userId: p.id, kind: "ANNOUNCE", title, body, link: "ann:" + a.id, fromId: me.id })) });
      await act(tx, me.id, "shared announcement", title);
    });
    return ok("Announcement shared with everyone");
  });
}
