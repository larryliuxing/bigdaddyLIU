import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getMemberById } from "./db";
import type { MemberRole, SessionUser } from "./types";

const MEMBER_COOKIE = "guild_session";
const ADMIN_COOKIE = "guild_admin_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.SESSION_SECRET || "guild-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

/**
 * Secure cookies are only sent over HTTPS. Our Aliyun deploy is often plain HTTP,
 * so default to non-secure unless COOKIE_SECURE=true (or request is HTTPS).
 */
export function shouldUseSecureCookies(request?: Request): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (request) {
    try {
      const url = new URL(request.url);
      if (url.protocol === "https:") return true;
      const proto = request.headers.get("x-forwarded-proto");
      if (proto?.split(",")[0]?.trim() === "https") return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function sessionCookieOptions(request?: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(request),
    path: "/",
    maxAge: MAX_AGE,
  };
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

/** Prefer attaching cookies on the Route Handler response (reliable Set-Cookie). */
export async function attachSessionCookie(
  response: NextResponse,
  user: SessionUser,
  request?: Request,
) {
  const token = await createSessionToken(user);
  const name = user.type === "admin" ? ADMIN_COOKIE : MEMBER_COOKIE;
  response.cookies.set(name, token, sessionCookieOptions(request));
  return response;
}

export async function setSessionCookie(user: SessionUser, request?: Request) {
  const token = await createSessionToken(user);
  const jar = await cookies();
  const opts = sessionCookieOptions(request);
  if (user.type === "admin") {
    jar.set(ADMIN_COOKIE, token, opts);
    return;
  }
  jar.set(MEMBER_COOKIE, token, opts);
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

export function clearMemberCookieOnResponse(response: NextResponse) {
  response.cookies.set(MEMBER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  });
}

export function clearAdminCookieOnResponse(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  });
}

export async function getMemberSession() {
  const jar = await cookies();
  const token = jar.get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session || session.type !== "member") return null;

  // Re-validate against DB so deleted/renamed/exited members cannot keep stale access
  const row = getMemberById(session.id);
  if (!row || row.status === "exited") {
    jar.delete(MEMBER_COOKIE);
    return null;
  }

  return {
    type: "member" as const,
    id: row.id,
    name: row.name,
    role: row.role,
  };
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

/** Navigate helper target after logout based on remaining sessions. */
export function logoutRedirectPath(remaining: {
  member: boolean;
  admin: boolean;
}) {
  if (remaining.member) return "/home";
  if (remaining.admin) return "/admin";
  return "/";
}
