import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { MemberRole, SessionUser } from "./types";

const MEMBER_COOKIE = "guild_session";
const ADMIN_COOKIE = "guild_admin_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.SESSION_SECRET || "guild-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.type === "admin" && typeof payload.username === "string") {
      return { type: "admin", username: payload.username };
    }
    if (
      payload.type === "member" &&
      typeof payload.id === "number" &&
      typeof payload.name === "string" &&
      typeof payload.role === "string"
    ) {
      return {
        type: "member",
        id: payload.id,
        name: payload.name,
        role: payload.role as MemberRole,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser) {
  const token = await createSessionToken(user);
  const jar = await cookies();
  if (user.type === "admin") {
    jar.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE,
    });
    return;
  }
  jar.set(MEMBER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(MEMBER_COOKIE);
  jar.delete(ADMIN_COOKIE);
}

export async function clearMemberSessionCookie() {
  const jar = await cookies();
  jar.delete(MEMBER_COOKIE);
}

export async function clearAdminSessionCookie() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export async function getMemberSession() {
  const jar = await cookies();
  const token = jar.get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session || session.type !== "member") return null;
  return session;
}

export async function getAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session || session.type !== "admin") return null;
  return session;
}

/** Prefer member identity for UI; fall back to admin. */
export async function getSession(): Promise<SessionUser | null> {
  const member = await getMemberSession();
  if (member) return member;
  return getAdminSession();
}

export async function requireMemberSession() {
  return getMemberSession();
}

export async function requireAdminSession() {
  return getAdminSession();
}
