// Session token helpers. Edge safe (used by middleware), so no database access here.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "td_session";
export const SESSION_DAYS = 7;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short. Set a long random value in .env");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string, role: string): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<{ userId: string; role: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { userId: payload.sub, role: String(payload.role || "MEMBER") };
  } catch {
    return null;
  }
}
