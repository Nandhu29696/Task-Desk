import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Unread count for the bell, checked every 60 seconds. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const unread = await prisma.notification.count({ where: { userId: me.id, readAt: null } });
  return NextResponse.json({ unread });
}
