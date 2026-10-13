"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { COMMS, INDUSTRIES, LINES, LIVE_STAGES, PRODUCT_LINES, RENEW_LINES, STAGE, STAGES, SVC, SVC_LINES, TEMPLATES, toProjLine } from "@/lib/constants";
import { dk, fmtDate, inr, isDayKey, kd, todayKey } from "@/lib/dates";
import { act } from "@/lib/log";
import { isAdmin } from "@/lib/permissions";
import { generate, renewalReminders } from "@/lib/generator";
import { bool, int, list, ok, refuse, run, str, type Result } from "@/lib/action";
import type { Me } from "@/lib/auth";

type Tx = Prisma.TransactionClient;
const adminOnly = (me: Me) => { if (!isAdmin(me)) refuse("Only the admin can manage clients."); };
const day = (v: string) => (isDayKey(v) ? v : "");
const num = (v: FormDataEntryValue | undefined) => { const n = Math.round(Number(v ?? "")); return Number.isFinite(n) && n > 0 ? n : 0; };

type SvcIn = { id: string; line: string; type: string; price: number; cycle: string | null; startDate: string; completedDate: string; item: string; provider: string; renewDate: string };

/** Reads the service rows of the client form (port of clientFrom). */
function servicesFrom(fd: FormData): SvcIn[] {
  const g = (k: string) => fd.getAll(k).map(String);
  const L = g("sv_line"), T = g("sv_type"), P = g("sv_price"), Cy = g("sv_cycle"), St = g("sv_start"), Dn = g("sv_done"), It = g("sv_item"), Pr = g("sv_provider"), Rn = g("sv_renew"), Id = g("sv_id");
  return L.map((line, i) => {
    if (!SVC_LINES.includes(line)) refuse("Unknown service.");
    const type = T[i] === "ONE_TIME" ? "ONE_TIME" : "RECURRING";
    const renew = RENEW_LINES.includes(line);
    return {
      id: Id[i] || "", line, type, price: num(P[i]), cycle: type === "RECURRING" ? (["MONTHLY", "QUARTERLY", "YEARLY"].includes(Cy[i]) ? Cy[i] : "MONTHLY") : null,
      startDate: day(St[i] || ""), completedDate: day(Dn[i] || ""), item: renew ? (It[i] || "").trim() : "", provider: renew ? (Pr[i] || "").trim() : "", renewDate: renew ? day(Rn[i] || "") : "",
    };
  });
}

async function clientFrom(fd: FormData) {
  const name = str(fd, "name");
  if (!name) refuse("Add the client name.");
  const pocName = str(fd, "poc_name");
  if (!pocName) refuse("Add the point of contact.");
  const stage = STAGES.includes(str(fd, "stage")) ? str(fd, "stage") : "LEAD";
  const ownerId = str(fd, "ownerId") || null;
  if (ownerId && !(await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } }))) refuse("Pick an account manager.");
  const industry = INDUSTRIES.includes(str(fd, "industry")) ? str(fd, "industry") : "Other";
  return {
    data: {
      name, industry, stage, ownerId, contractRenewal: day(str(fd, "renewal")) || null, city: str(fd, "city"), gst: str(fd, "gst"), website: str(fd, "website"), address: str(fd, "address"), notes: str(fd, "notes"),
      pocName, pocRole: str(fd, "poc_role"), pocPhone: str(fd, "poc_phone"), pocEmail: str(fd, "poc_email"), comms: list(fd, "comms").filter((c) => COMMS[c]).join(","),
    },
    services: servicesFrom(fd),
  };
}

const svcData = (s: SvcIn) => ({ line: s.line, type: s.type, price: s.price, cycle: s.cycle, startDate: s.startDate, completedDate: s.completedDate, item: s.item, provider: s.provider, renewDate: s.renewDate });
const note = (tx: Tx, clientId: string, byId: string, text: string, on = todayKey()) => tx.clientNote.create({ data: { clientId, byId, on, text } });

export async function addClient(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const { data, services } = await clientFrom(fd);
    const c = await prisma.$transaction(async (tx) => {
      const c = await tx.client.create({ data: { ...data, onboardedOn: LIVE_STAGES.includes(data.stage) ? todayKey() : null, services: { create: services.map(svcData) } } });
      await act(tx, me.id, "added client", c.name);
      return c;
    });
    await renewalReminders();
    return ok("Client added", { href: `/clients/${c.id}` });
  });
}

/** Saves the client form, keeping service ids so renewal reminders stay linked. */
export async function editClient(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const id = str(fd, "id");
    if (str(fd, "intent") === "delete") return removeClient(me, id);
    const c = await prisma.client.findUnique({ where: { id }, include: { services: { select: { id: true } } } });
    if (!c) refuse("Client not found.");
    const { data, services } = await clientFrom(fd);
    const known = new Set(c!.services.map((s) => s.id));
    await prisma.$transaction(async (tx) => {
      const reachLive = data.stage !== c!.stage && ["ONBOARDING", "ACTIVE"].includes(data.stage) && !c!.onboardedOn;
      await tx.client.update({ where: { id }, data: { ...data, ...(reachLive ? { onboardedOn: todayKey() } : {}) } });
      const keep = services.filter((s) => known.has(s.id)).map((s) => s.id);
      await tx.clientService.deleteMany({ where: { clientId: id, id: { notIn: keep } } });
      for (const s of services) {
        if (known.has(s.id)) await tx.clientService.update({ where: { id: s.id }, data: svcData(s) });
        else await tx.clientService.create({ data: { clientId: id, ...svcData(s) } });
      }
      if (data.stage !== c!.stage) {
        await note(tx, id, me.id, `Stage changed from ${STAGE[c!.stage]} to ${STAGE[data.stage]}`);
        await act(tx, me.id, "moved client", `${data.name} to ${STAGE[data.stage]}`);
      }
    });
    await renewalReminders();
    return ok("Client saved");
  });
}

async function removeClient(me: Me, id: string): Promise<Result> {
  const c = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!c) refuse("Client not found.");
  await prisma.$transaction(async (tx) => {
    await tx.project.updateMany({ where: { clientId: id }, data: { clientLabel: c!.name } });
    await tx.client.delete({ where: { id } });
    await act(tx, me.id, "deleted client", c!.name);
  });
  return ok("Client deleted", { href: "/clients" });
}

export async function deleteClient(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => { adminOnly(me); return removeClient(me, str(fd, "id")); });
}

/** Stage dropdown on the client page. Fields: id, stage. */
export async function setStage(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const stage = str(fd, "stage");
    if (!STAGES.includes(stage)) refuse("Unknown stage.");
    const c = await prisma.client.findUnique({ where: { id: str(fd, "id") } });
    if (!c) refuse("Client not found.");
    if (c!.stage === stage) return ok("Moved to " + STAGE[stage]);
    await prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id: c!.id }, data: { stage, ...(["ONBOARDING", "ACTIVE"].includes(stage) && !c!.onboardedOn ? { onboardedOn: todayKey() } : {}) } });
      await note(tx, c!.id, me.id, `Stage changed from ${STAGE[c!.stage]} to ${STAGE[stage]}`);
      await act(tx, me.id, "moved client", `${c!.name} to ${STAGE[stage]}`);
    });
    return ok("Moved to " + STAGE[stage]);
  });
}

// ============ services ============

async function serviceOf(fd: FormData) {
  const s = await prisma.clientService.findUnique({ where: { id: str(fd, "sv") || str(fd, "svcId") }, include: { client: { select: { id: true, name: true } } } });
  if (!s) refuse("Service not found.");
  return s!;
}

/** One service row on its own. Same field names as the client form (sv_line, sv_type and so on). Field: id (client). */
export async function addService(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const clientId = str(fd, "id");
    if (!(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) refuse("Client not found.");
    const [s] = servicesFrom(fd);
    if (!s) refuse("Pick a service.");
    await prisma.clientService.create({ data: { clientId, ...svcData(s!) } });
    await renewalReminders();
    return ok("Service added");
  });
}

export async function editService(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const old = await serviceOf(fd);
    const [s] = servicesFrom(fd);
    if (!s) refuse("Pick a service.");
    await prisma.clientService.update({ where: { id: old.id }, data: svcData(s!) });
    await renewalReminders();
    return ok("Service saved");
  });
}

export async function removeService(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const s = await serviceOf(fd);
    await prisma.clientService.delete({ where: { id: s.id } });
    return ok("Service removed");
  });
}

/** Mark completed today. Fields: sv (service). */
export async function completeService(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const s = await serviceOf(fd);
    await prisma.$transaction(async (tx) => {
      await tx.clientService.update({ where: { id: s.id }, data: { completedDate: todayKey() } });
      await note(tx, s.clientId, me.id, `${SVC[s.line]} ${s.type === "ONE_TIME" ? "project" : "plan"} marked completed`);
    });
    return ok("Marked completed");
  });
}

/** Renewed for 1 year: moves the renewal date a year on and closes the open reminder task. Fields: sv (service). */
export async function renewService(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const s = await serviceOf(fd);
    if (!s.renewDate) refuse("This service has no renewal date.");
    const d = kd(s.renewDate); d.setUTCFullYear(d.getUTCFullYear() + 1);
    const next = dk(d);
    await prisma.$transaction(async (tx) => {
      await tx.clientService.update({ where: { id: s.id }, data: { renewDate: next } });
      await tx.task.updateMany({ where: { renewKey: `${s.id}:${s.renewDate}`, status: { notIn: ["DONE", "CANCELLED"] } }, data: { status: "DONE", completedAt: new Date() } });
      await note(tx, s.clientId, me.id, `${SVC[s.line]} ${s.item || ""} renewed. Next renewal ${fmtDate(next)}.`.replace(/\s+/g, " "));
      await act(tx, me.id, "renewed", `${SVC[s.line]} ${s.item || ""} for ${s.client.name}`.replace(/\s+/g, " "));
    });
    return ok("Renewed. Next renewal " + fmtDate(next));
  });
}

// ============ payments, contacts, notes ============

export async function addPayment(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const clientId = str(fd, "id"), amount = int(fd, "amount");
    if (!amount || amount <= 0) refuse("Add the amount received.");
    if (!(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) refuse("Client not found.");
    await prisma.payment.create({ data: { clientId, amount: amount!, receivedOn: day(str(fd, "on")) || todayKey(), note: str(fd, "note") } });
    return ok(`${inr(amount)} recorded`);
  });
}

export async function removePayment(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    await prisma.payment.deleteMany({ where: { id: str(fd, "p"), clientId: str(fd, "id") } });
    return ok("Payment removed");
  });
}

export async function addContact(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const clientId = str(fd, "id"), name = str(fd, "name");
    if (!name) refuse("Add a name.");
    if (!(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) refuse("Client not found.");
    await prisma.clientContact.create({ data: { clientId, name, role: str(fd, "role"), phone: str(fd, "phone"), email: str(fd, "email") } });
    return ok("Contact added");
  });
}

export async function removeContact(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    await prisma.clientContact.deleteMany({ where: { id: str(fd, "k"), clientId: str(fd, "id") } });
    return ok("Contact removed");
  });
}

export async function addNote(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const clientId = str(fd, "id"), text = str(fd, "text");
    if (!text) refuse("Write the note first.");
    if (!(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) refuse("Client not found.");
    await prisma.clientNote.create({ data: { clientId, byId: me.id, on: day(str(fd, "on")) || todayKey(), text } });
    return ok("Note added");
  });
}

// ============ move to live ============

/** Creates the project with starter recurring tasks and moves the client to Active. */
export async function goLive(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    adminOnly(me);
    const c = await prisma.client.findUnique({ where: { id: str(fd, "id") }, include: { services: true } });
    if (!c) refuse("Client not found.");
    const name = str(fd, "name");
    if (!name) refuse("Add a project name.");
    const leadId = str(fd, "leadId");
    const lead = leadId ? await prisma.user.findUnique({ where: { id: leadId }, select: { id: true, active: true } }) : null;
    if (!lead || !lead.active) refuse("Pick a project lead.");
    const line = LINES.includes(str(fd, "line")) ? str(fd, "line") : "SEO";
    const start = day(str(fd, "start")) || todayKey();
    const memberIds = [...new Set([...list(fd, "m"), leadId])];
    const valid = new Set((await prisma.user.findMany({ where: { id: { in: memberIds }, active: true }, select: { id: true } })).map((u) => u.id));
    const svcs = c!.services;
    const tpls = bool(fd, "tpl")
      ? (() => {
          const rec = new Set(svcs.filter((x) => x.type === "RECURRING" && !PRODUCT_LINES.includes(x.line)).map((x) => toProjLine(x.line)));
          const one = new Set(svcs.filter((x) => x.type === "ONE_TIME").map((x) => toProjLine(x.line)));
          return TEMPLATES.filter((t) => (t.frequency !== "ONCE" && rec.has(t.line)) || (t.frequency === "ONCE" && one.has(t.line)));
        })()
      : [];
    const prev = c!.stage;
    const p = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          name, clientId: c!.id, website: c!.website, industry: c!.industry, line, description: c!.notes, status: "ACTIVE", leadId, startDate: start,
          pocName: c!.pocName, pocRole: c!.pocRole, pocPhone: c!.pocPhone, pocEmail: c!.pocEmail, comms: c!.comms,
          members: { create: memberIds.filter((id) => valid.has(id)).map((userId) => ({ userId })) },
        },
      });
      for (const t of tpls) {
        await tx.recurringRule.create({
          data: { projectId: p.id, title: t.title, description: t.description, category: t.line, frequency: t.frequency, weekday: t.weekday, monthDay: t.monthDay, skipWeekends: true, dueOffsetDays: t.dueOffsetDays, startDate: start, assigneeId: null, priority: t.priority, estimate: t.est, checklist: JSON.stringify(t.checklist) },
        });
      }
      await tx.client.update({ where: { id: c!.id }, data: { stage: "ACTIVE", ...(c!.onboardedOn ? {} : { onboardedOn: start }) } });
      await tx.clientService.updateMany({ where: { clientId: c!.id, startDate: "" }, data: { startDate: start } });
      await note(tx, c!.id, me.id, `Moved to live from ${STAGE[prev]}. Project ${p.name} created.`);
      await act(tx, me.id, "moved client to live", `${c!.name}, ${tpls.length} recurring tasks`, null, p.id);
      return p;
    });
    const n = await generate({ projectId: p.id, byId: me.id });
    return ok(`${c!.name} is live. ${n} tasks scheduled`, { href: `/projects/${p.id}` });
  });
}
