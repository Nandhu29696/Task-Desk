import { NextResponse, type NextRequest } from "next/server";
import { runDailyJob } from "@/lib/generator";

export const dynamic = "force-dynamic";

/**
 * Daily job: closes open sessions from earlier days, creates recurring tasks up to the lookahead,
 * and creates renewal reminders. Call it once a day with: Authorization: Bearer CRON_SECRET
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const result = await runDailyJob();
  return NextResponse.json({ ok: true, ...result });
}
export const POST = handle;
export const GET = handle;
