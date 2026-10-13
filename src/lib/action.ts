import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentUser, type Me } from "./auth";

/** What every server action returns. ActionForm shows ok or error as a toast. */
export type Result = { ok?: string; error?: string; at?: number; data?: Record<string, unknown> } | undefined;

export const ok = (msg = "Saved", data?: Record<string, unknown>): Result => ({ ok: msg, at: Date.now(), data });
export const fail = (msg: string): Result => ({ error: msg, at: Date.now() });

export class ActionError extends Error {}
/** Throw inside an action to stop and show the message. */
export const refuse = (msg: string): never => { throw new ActionError(msg); };

/**
 * Wraps a server action body: loads the signed in user, runs the body,
 * refreshes every page, and turns refusals and errors into a toast message.
 */
export async function run(body: (me: Me) => Promise<Result | void>): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return fail("Please sign in again.");
  try {
    const r = await body(me);
    revalidatePath("/", "layout");
    return r || ok();
  } catch (e) {
    if (e instanceof ActionError) return fail(e.message);
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    console.error(e);
    return fail("Something went wrong. Please try again.");
  }
}

// Form helpers
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const opt = (fd: FormData, k: string) => { const v = str(fd, k); return v || null; };
export const int = (fd: FormData, k: string) => { const v = str(fd, k); if (v === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) ? n : null; };
export const bool = (fd: FormData, k: string) => { const v = fd.get(k); return v === "on" || v === "true" || v === "1"; };
export const list = (fd: FormData, k: string) => fd.getAll(k).map((x) => String(x)).filter(Boolean);
