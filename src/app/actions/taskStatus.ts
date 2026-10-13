"use server";

import { prisma } from "@/lib/db";
import { STATUS, closed } from "@/lib/constants";
import { changeStatus } from "@/lib/taskops";
import { fail, ok, run, str, refuse, type Result } from "@/lib/action";

/** Status dropdowns, the Move to picker and the board. Form fields: id, status. */
export async function setTaskStatus(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const status = str(fd, "status");
    if (!status) return ok("", undefined);
    const r = await changeStatus(me, str(fd, "id"), status);
    if (!r.ok) refuse(r.error);
    return ok("Moved to " + STATUS[status]);
  });
}

/** The round tick: open task to Done, closed task back to To do. Form field: id. */
export async function toggleTaskDone(_p: Result, fd: FormData): Promise<Result> {
  return run(async (me) => {
    const t = await prisma.task.findUnique({ where: { id: str(fd, "id") }, select: { id: true, status: true } });
    if (!t) return fail("This task was deleted.");
    const next = closed(t.status) ? "TODO" : "DONE";
    const r = await changeStatus(me, t.id, next);
    if (!r.ok) refuse(r.error);
    return ok(next === "DONE" ? "Marked done" : "Reopened");
  });
}
