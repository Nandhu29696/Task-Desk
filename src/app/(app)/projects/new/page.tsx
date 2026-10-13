// Port of the preview's vNewProject. ?client=<id> preselects a client (admin).
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCtx, userOpts } from "@/lib/context";
import { splitList } from "@/lib/model";
import { isAdmin, isLeadOrAdmin } from "@/lib/permissions";
import { Empty } from "@/components/ui";
import { NewProjectForm, type ClientOpt } from "@/components/projects/NewProjectForm";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const { me, today } = ctx;
  if (!isLeadOrAdmin(me)) return <Empty>Only leads and admins can create projects.</Empty>;
  const admin = isAdmin(me);
  const rows = admin ? await prisma.client.findMany({ where: { stage: { not: "CHURNED" } }, orderBy: { name: "asc" } }) : [];
  const clients: ClientOpt[] = rows.map((c) => ({ id: c.id, name: c.name, industry: c.industry || "", poc: { name: c.pocName, role: c.pocRole, phone: c.pocPhone, email: c.pocEmail }, comms: splitList(c.comms) }));
  const presetClient = clients.some((c) => c.id === sp.client) ? sp.client! : "";
  return (
    <>
      <header className="stack" style={{ gap: 4 }}>
        <Link className="link small" href="/projects" style={{ justifySelf: "start" }}>Back to projects</Link>
        <h1>New project</h1>
        <p className="soft">Set up the client, the team and the recurring work. Tasks start appearing as soon as you save.</p>
      </header>
      <NewProjectForm
        admin={admin} clients={clients} presetClient={presetClient}
        leads={ctx.active.filter((x) => x.role !== "MEMBER").map((x): [string, string] => [x.id, x.name])}
        people={userOpts(ctx)} team={ctx.active.map((x): [string, string] => [x.id, x.name])}
        meId={me.id} today={today}
      />
    </>
  );
}
