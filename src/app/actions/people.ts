"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { act, notify, notifyAdmins } from "@/lib/log";
import { addableRoles, canEditPerson, isAdmin } from "@/lib/permissions";
import { EMPTYPE, ROLE } from "@/lib/constants";
import { bool, list, ok, opt, refuse, run, str, type Result } from "@/lib/action";

const asPerson = (x: { id: string; role: string; reportsToId: string | null; addedById: string | null }) => ({ id: x.id, role: x.role, reportsTo: x.reportsToId, addedBy: x.addedById });

export async function addPerson(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const role = str(fd, "role");
    if (!addableRoles(me).includes(role)) refuse("You cannot add someone with that access");
    const name = str(fd, "name");
    if (!name) refuse("Enter the full name");
    const email = str(fd, "email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) refuse("Enter a valid work email");
    const password = String(fd.get("password") ?? "");
    if (password.length < 8) refuse("Use at least 8 characters for the temporary password");
    if (await prisma.user.findUnique({ where: { email } })) refuse("Someone already uses that email");
    const emp = EMPTYPE[str(fd, "emp")] ? str(fd, "emp") : "ON_ROLE";

    let reportsTo: string = me.id;
    if (isAdmin(me)) {
      const want = opt(fd, "reportsTo");
      if (want && want !== me.id) {
        const boss = await prisma.user.findUnique({ where: { id: want }, select: { id: true, role: true, active: true } });
        if (!boss || !boss.active || boss.role === "MEMBER") refuse("Pick a lead or the admin for Reports to");
        reportsTo = want;
      }
    }

    const wanted = list(fd, "projects");
    const projects = wanted.length
      ? await prisma.project.findMany({ where: { id: { in: wanted }, status: { not: "ARCHIVED" }, ...(isAdmin(me) ? {} : { leadId: me.id }) }, select: { id: true, name: true } })
      : [];
    const hash = await bcrypt.hash(password, 12);
    const title = str(fd, "title");

    await prisma.$transaction(async (tx) => {
      const nu = await tx.user.create({
        data: { name, email, role, title: title || null, phone: str(fd, "phone") || null, location: str(fd, "location") || null, empType: emp, active: true, reportsToId: reportsTo, addedById: me.id, passwordHash: hash, mustChangePassword: true },
      });
      if (projects.length) await tx.projectMember.createMany({ data: projects.map((p) => ({ projectId: p.id, userId: nu.id })) });
      await act(tx, me.id, "added team member", `${name}, ${ROLE[role]}`);
      await notify(tx, nu.id, "UPDATE", "Welcome to TaskDesk", `${me.name} added you as ${ROLE[role].toLowerCase()}${projects.length ? " on " + projects.map((p) => p.name).join(", ") : ""}.`, "/", me.id);
      if (!isAdmin(me)) await notifyAdmins(tx, "UPDATE", `${me.name} added ${name}`, `New member: ${title || "no position yet"}, ${EMPTYPE[emp]}.`, `/people/${nu.id}`, me.id);
      if (reportsTo !== me.id) await notify(tx, reportsTo, "UPDATE", `${name} now reports to you`, `${me.name} added ${name} as ${ROLE[role].toLowerCase()}.`, `/people/${nu.id}`, me.id);
    });
    return ok(`${name} can now sign in`);
  });
}

export async function editPerson(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const x = await prisma.user.findUnique({ where: { id: str(fd, "id") } });
    if (!x || !canEditPerson(me, asPerson(x))) refuse("You cannot edit this person");
    const name = str(fd, "name") || x!.name;
    const emp = EMPTYPE[str(fd, "emp")] ? str(fd, "emp") : x!.empType;
    const base = { name, title: str(fd, "title") || null, phone: str(fd, "phone") || null, location: str(fd, "location") || null, empType: emp };
    if (isAdmin(me)) {
      const role = ROLE[str(fd, "role")] ? str(fd, "role") : x!.role;
      const active = bool(fd, "active");
      if (x!.id === me.id && (role !== "ADMIN" || !active)) refuse("You cannot remove your own admin access");
      let reportsTo = opt(fd, "reportsTo");
      if (reportsTo) {
        if (reportsTo === x!.id) refuse("Someone cannot report to themselves");
        const boss = await prisma.user.findUnique({ where: { id: reportsTo }, select: { role: true } });
        if (!boss || boss.role === "MEMBER") reportsTo = null;
      }
      await prisma.user.update({ where: { id: x!.id }, data: { ...base, role, active, reportsToId: reportsTo } });
    } else {
      await prisma.user.update({ where: { id: x!.id }, data: base });
    }
    return ok("Saved " + name);
  });
}

export async function resetPassword(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const x = await prisma.user.findUnique({ where: { id: str(fd, "id") } });
    if (!x || !canEditPerson(me, asPerson(x))) refuse("You cannot reset this password");
    const password = String(fd.get("password") ?? "");
    if (password.length < 8) refuse("Use at least 8 characters");
    await prisma.user.update({ where: { id: x!.id }, data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true } });
    return ok("Password reset for " + x!.name + ". Share it privately");
  });
}

export async function editMe(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    await prisma.user.update({ where: { id: me.id }, data: { phone: str(fd, "phone") || null, location: str(fd, "location") || null } });
    return ok("Your details are saved", { href: "/people" });
  });
}
