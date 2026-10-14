import { NextResponse, type NextRequest } from "next/server";
import { runDailyJob } from "@/lib/generator";
import { createHash, timingSafeEqual } from "node:crypto";

/** Constant time comparison, so the secret cannot be guessed from response times. */
const sameSecret = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export const dynamic = "force-dynamic";

/**
 * Daily job: closes open sessions from earlier days, creates recurring tasks up to the lookahead,
 * and creates renewal reminders. Call it once a day with: Authorization: Bearer CRON_SECRET
 */
async function handle(req: NextRequest) {
  // The secret is accepted only in the Authorization header, never in the URL, so it stays out of server logs.
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameSecret(req.headers.get("authorization") || "", `Bearer ${secret}`)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const result = await runDailyJob();
  return NextResponse.json({ ok: true, ...result });
}
export const POST = handle;
export const GET = handle;
