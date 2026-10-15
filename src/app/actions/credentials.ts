"use server";

import { prisma } from "@/lib/db";
import { ACCESS } from "@/lib/constants";
import { todayKey } from "@/lib/dates";
import { encrypt, decrypt } from "@/lib/crypto";
import { getCurrentUser, type Me } from "@/lib/auth";
import { credLevel, isAdmin } from "@/lib/permissions";
import { ok, refuse, run, str, type Result } from "@/lib/action";

const adminOnly = (me: Me) => { if (!isAdmin(me)) refuse("Only the admin can manage credentials."); };
const lvl = (v: string) => (ACCESS[v] ? v : "NONE");

async function fieldsFrom(fd: FormData) {
  const name = str(fd, "name");
  if (!name) refuse("Add a name.");
  const username = str(fd, "username");
  if (!username) refuse("Add the username, email or mobile number.");
  const scope = str(fd, "scope") === "INTERNAL" ? "INTERNAL" : "CLIENT";
  const clientId = scope === "CLIENT" ? str(fd, "clientId") || null : null;
  if (clientId && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) refuse("Client not found.");
  return { name, scope, clientId, url: str(fd, "url"), username, notes: str(fd, "notes"), leadAccess: lvl(str(fd, "acc_LEAD")), memberAccess: lvl(str(fd, "acc_MEMBER")) };
}

export async function addCredential(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const data = await fieldsFrom(fd);
    const password = String(fd.get("password") ?? "");
    if (!password) refuse("Add the password.");
    await prisma.$transaction(async (tx) => {
      const c = await tx.credential.create({ data: { ...data, passwordEnc: encrypt(password), changedOn: todayKey() } });
      await tx.credentialView.create({ data: { credentialId: c.id, userId: me.id, name: c.name, action: "added" } });
    });
    return ok("Login saved");
  });
}

/** Edit popup. An empty password keeps the current one; a new password sets the changed date. intent=delete deletes. */
export async function editCredential(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const id = str(fd, "id");
    if (str(fd, "intent") === "delete") return removeCredential(me, id);
    const old = await prisma.credential.findUnique({ where: { id }, select: { id: true, passwordEnc: true } });
    if (!old) refuse("This login was deleted.");
    const data = await fieldsFrom(fd);
    const password = String(fd.get("password") ?? "");
    let same = false;
    try { same = password === decrypt(old!.passwordEnc); } catch { same = false; }
    const changed = !!password && !same;
    await prisma.$transaction(async (tx) => {
      await tx.credential.update({ where: { id }, data: { ...data, ...(changed ? { passwordEnc: encrypt(password), changedOn: todayKey() } : {}) } });
      await tx.credentialView.create({ data: { credentialId: id, userId: me.id, name: data.name, action: "edited" } });
    });
    return ok("Login saved");
  });
}

async function removeCredential(me: Me, id: string): Promise<Result> {
  const c = await prisma.credential.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!c) refuse("This login was deleted.");
  await prisma.$transaction(async (tx) => {
    await tx.credentialView.create({ data: { credentialId: null, userId: me.id, name: c!.name, action: "deleted" } });
    await tx.credential.delete({ where: { id } });
  });
  return ok("Login deleted");
}

export async function deleteCredential(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => { adminOnly(me); return removeCredential(me, str(fd, "id")); });
}

/** Access dropdowns. Fields: id, role (LEAD or MEMBER), value (NONE, LOGIN or FULL). */
export async function setAccess(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const role = str(fd, "role"), value = str(fd, "value");
    if (role !== "LEAD" && role !== "MEMBER") refuse("Pick leads or members.");
    if (!ACCESS[value]) refuse("Pick an access level.");
    const c = await prisma.credential.findUnique({ where: { id: str(fd, "id") }, select: { id: true, name: true } });
    if (!c) refuse("This login was deleted.");
    await prisma.$transaction(async (tx) => {
      await tx.credential.update({ where: { id: c!.id }, data: role === "LEAD" ? { leadAccess: value } : { memberAccess: value } });
      await tx.credentialView.create({ data: { credentialId: c!.id, userId: me.id, name: c!.name, action: `set ${role === "LEAD" ? "leads" : "members"} to ${ACCESS[value].toLowerCase()} for` } });
    });
    return ok(`${role === "LEAD" ? "Leads" : "Members"}: ${ACCESS[value]}`);
  });
}

/** Bound to one credential id by the page. Needs full access; every view and every copy is logged. */
export async function revealCredential(id: string, purpose: "view" | "copy" = "view"): Promise<{ value?: string; error?: string }> {
  const me = await getCurrentUser();
  if (!me) return { error: "Please sign in again." };
  const c = await prisma.credential.findUnique({ where: { id }, select: { id: true, name: true, passwordEnc: true, leadAccess: true, memberAccess: true } });
  if (!c) return { error: "This login was deleted." };
  if (credLevel(me, c) !== "FULL") return { error: "This password is not shared with you." };
  let value = "";
  try { value = decrypt(c.passwordEnc); } catch { return { error: "This password could not be read. Check the encryption key." }; }
  await prisma.credentialView.create({ data: { credentialId: c.id, userId: me.id, name: c.name, action: purpose === "copy" ? "copied password for" : "viewed" } });
  return { value };
}
