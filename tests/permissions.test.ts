// Every permission rule for the admin, a lead and a member.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addableRoles, canAddPeople, canApproveLeave, canDelete, canEdit, canEditPerson, canManage, canReassign,
  canSeeLog, canSeeToolPassword, credLevel, isAdmin, isLeadOrAdmin,
} from "../src/lib/permissions";
import { blockerCount, mentionedUsers } from "../src/lib/logic";

const admin = { id: "a", role: "ADMIN" };
const lead = { id: "l", role: "LEAD" };
const otherLead = { id: "l2", role: "LEAD" };
const member = { id: "m", role: "MEMBER" };
const project = { leadId: "l" };
const task = (o: Partial<{ assigneeId: string | null; createdById: string | null; collab: string[]; projectId: string | null }> = {}) =>
  ({ assigneeId: "x", createdById: "y", collab: [], projectId: "p", ...o });

test("roles", () => {
  assert.equal(isAdmin(admin), true);
  assert.equal(isLeadOrAdmin(lead), true);
  assert.equal(isLeadOrAdmin(member), false);
});

test("only the admin or the project's own lead manages a project", () => {
  assert.equal(canManage(admin, project), true);
  assert.equal(canManage(lead, project), true);
  assert.equal(canManage(otherLead, project), false);
  assert.equal(canManage(member, project), false);
  assert.equal(canManage(lead, null), false);
});

test("a task can be edited by its assignee, creator, collaborators, project lead and the admin", () => {
  assert.equal(canEdit(member, task({ assigneeId: "m" }), project), true);
  assert.equal(canEdit(member, task({ createdById: "m" }), project), true);
  assert.equal(canEdit(member, task({ collab: ["m"] }), project), true);
  assert.equal(canEdit(lead, task(), project), true);
  assert.equal(canEdit(admin, task(), null), true);
  assert.equal(canEdit(member, task(), project), false);
  assert.equal(canEdit(otherLead, task(), project), false);
});

test("reassigning: admin, project lead, the creator, or any lead for tasks without a project", () => {
  assert.equal(canReassign(admin, task(), project), true);
  assert.equal(canReassign(lead, task(), project), true);
  assert.equal(canReassign(member, task({ createdById: "m" }), project), true);
  assert.equal(canReassign(otherLead, task({ projectId: null }), null), true);
  assert.equal(canReassign(otherLead, task(), project), false);
  assert.equal(canReassign(member, task({ assigneeId: "m" }), project), false);
});

test("only the admin deletes tasks", () => {
  assert.equal(canDelete(admin), true);
  assert.equal(canDelete(lead), false);
});

test("the admin approves leave, but not their own", () => {
  assert.equal(canApproveLeave(admin, "m"), true);
  assert.equal(canApproveLeave(admin, "a"), false);
  assert.equal(canApproveLeave(lead, "m"), false);
});

test("adding people: admin adds leads and members, a lead adds members", () => {
  assert.equal(canAddPeople(member), false);
  assert.deepEqual(addableRoles(admin), ["LEAD", "MEMBER"]);
  assert.deepEqual(addableRoles(lead), ["MEMBER"]);
  assert.deepEqual(addableRoles(member), []);
});

test("a lead edits only members who report to them or whom they added", () => {
  assert.equal(canEditPerson(lead, { id: "m", role: "MEMBER", reportsTo: "l" }), true);
  assert.equal(canEditPerson(lead, { id: "m", role: "MEMBER", addedBy: "l" }), true);
  assert.equal(canEditPerson(lead, { id: "m", role: "MEMBER", reportsTo: "l2" }), false);
  assert.equal(canEditPerson(lead, { id: "l2", role: "LEAD", reportsTo: "l" }), false);
  assert.equal(canEditPerson(admin, { id: "l2", role: "LEAD" }), true);
  assert.equal(canEditPerson(member, { id: "m", role: "MEMBER" }), false);
});

test("activity log: admin sees all, a lead sees themselves and members, a member only themselves", () => {
  assert.equal(canSeeLog(admin, otherLead), true);
  assert.equal(canSeeLog(lead, member), true);
  assert.equal(canSeeLog(lead, otherLead), false);
  assert.equal(canSeeLog(member, member), true);
  assert.equal(canSeeLog(member, { id: "m2", role: "MEMBER" }), false);
});

test("credential access follows the per role setting, the admin always has full access", () => {
  const c = { leadAccess: "LOGIN", memberAccess: "NONE" };
  assert.equal(credLevel(admin, c), "FULL");
  assert.equal(credLevel(lead, c), "LOGIN");
  assert.equal(credLevel(member, c), "NONE");
});

test("tool passwords follow the visibility setting", () => {
  assert.equal(canSeeToolPassword(member, { visibility: "ALL" }), true);
  assert.equal(canSeeToolPassword(member, { visibility: "LEAD" }), false);
  assert.equal(canSeeToolPassword(lead, { visibility: "LEAD" }), true);
  assert.equal(canSeeToolPassword(lead, { visibility: "ADMIN" }), false);
  assert.equal(canSeeToolPassword(admin, { visibility: "ADMIN" }), true);
});

test("a task is blocked by open linked tasks and pending approvals only", () => {
  const status: Record<string, string> = { d1: "IN_PROGRESS", d2: "DONE" };
  const t = { id: "t", status: "WAITING", deps: ["d1", "d2"], approvals: [{ status: "PENDING", userId: "a" }, { status: "APPROVED", userId: "b" }], dueDate: null, priority: "MEDIUM" };
  assert.equal(blockerCount(t, (id) => status[id]), 2);
});

test("mentions match full names and first names, but not inactive people", () => {
  const people = [{ id: "1", name: "Priya Raman", active: true }, { id: "2", name: "Karthik S", active: true }, { id: "3", name: "Old Person", active: false }];
  assert.deepEqual(mentionedUsers("Thanks @Priya Raman and @karthik, cc @Old", people).map((u) => u.id), ["1", "2"]);
});
