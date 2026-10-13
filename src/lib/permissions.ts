// Every permission rule in one place. Pure functions, used by pages (to hide buttons)
// and by server actions (to refuse the write). Never trust the browser.
type Who = { id: string; role: string };
type Person = { id: string; role: string; reportsTo?: string | null; addedBy?: string | null };
type Proj = { leadId: string | null } | null | undefined;
type TaskLike = { assigneeId: string | null; createdById: string | null; collab: string[] };

export const isAdmin = (u: Who) => u.role === "ADMIN";
export const isLeadOrAdmin = (u: Who) => u.role === "ADMIN" || u.role === "LEAD";

export const canManage = (u: Who, p: Proj) => isAdmin(u) || (u.role === "LEAD" && !!p && p.leadId === u.id);
export const canEdit = (u: Who, t: TaskLike, p: Proj) => isAdmin(u) || t.assigneeId === u.id || t.createdById === u.id || t.collab.includes(u.id) || canManage(u, p);
export const canReassign = (u: Who, t: TaskLike & { projectId: string | null }, p: Proj) => isAdmin(u) || canManage(u, p) || (!t.projectId && u.role === "LEAD") || t.createdById === u.id;
export const canDelete = (u: Who) => isAdmin(u);
export const canApproveLeave = (u: Who, leaveUserId: string) => isAdmin(u) && leaveUserId !== u.id;

export const canAddPeople = (u: Who) => isLeadOrAdmin(u);
export const addableRoles = (u: Who): string[] => (u.role === "ADMIN" ? ["LEAD", "MEMBER"] : u.role === "LEAD" ? ["MEMBER"] : []);
export const canEditPerson = (u: Who, x: Person | null | undefined) => !!x && (isAdmin(u) || (u.role === "LEAD" && x.role === "MEMBER" && (x.reportsTo === u.id || x.addedBy === u.id)));
/** Activity log: admin sees everyone, a lead sees themselves and every member, a member sees only themselves. */
export const canSeeLog = (u: Who, x: Person | null | undefined) => !!x && (isAdmin(u) || x.id === u.id || (u.role === "LEAD" && x.role === "MEMBER"));

export const credLevel = (u: Who, c: { leadAccess: string; memberAccess: string }) => (isAdmin(u) ? "FULL" : u.role === "LEAD" ? c.leadAccess : c.memberAccess);
export const canSeeToolPassword = (u: Who, t: { visibility: string }) => isAdmin(u) || t.visibility === "ALL" || (t.visibility === "LEAD" && u.role === "LEAD");
