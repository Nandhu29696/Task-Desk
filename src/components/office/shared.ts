// Labels and small pure helpers shared by the office pages and actions.
export const SATRULE: Record<string, string> = { ALL_WORK: "All Saturdays working", SECOND_FOURTH: "2nd and 4th Saturday off", ALL_OFF: "All Saturdays off" };
export const PWVIS: Record<string, string> = { ALL: "Everyone", LEAD: "Leads and admin", ADMIN: "Admin only" };

/** A random password from letters and digits that are easy to read. */
export function tempPassword(n = 10) {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (x) => c[x % c.length]).join("");
}
