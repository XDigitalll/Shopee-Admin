import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_REFRESH_COOKIE, ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import { forwardXsrfCookie } from "@/app/api/admin/_utils";
import { decodeJwtPayload } from "@/lib/admin/jwt";
import { extractRoleCandidates, getPrimaryRole, normalizeRole } from "@/lib/admin/roles";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const isSecure = process.env.NODE_ENV === "production";

type BackendProfile = Record<string, unknown> & {
  role?: unknown;
  roles?: unknown;
  authorities?: unknown;
  name?: unknown;
  email?: unknown;
  avatarUrl?: unknown;
};

function adminCookieOpts(httpOnly: boolean, maxAge: number) {
  return { httpOnly, secure: isSecure, sameSite: "lax" as const, path: "/", maxAge };
}

export async function POST(request: NextRequest) {
  const body = await request.text();

  const response = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        message:
          (payload &&
            typeof payload === "object" &&
            "message" in payload &&
            typeof payload.message === "string" &&
            payload.message) ||
          "Não foi possível autenticar no backend.",
      },
      { status: response.status }
    );
  }

  if (payload?.token && payload?.refreshToken) {
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE, "", adminCookieOpts(true, 0));
    cookieStore.set(ADMIN_REFRESH_COOKIE, "", adminCookieOpts(true, 0));
    cookieStore.set(ADMIN_SESSION_COOKIE, payload.token, adminCookieOpts(true, 86_400));
    cookieStore.set(ADMIN_REFRESH_COOKIE, payload.refreshToken, adminCookieOpts(true, 2_592_000));
  }

  if (!payload?.token) {
    return NextResponse.json({ message: "Resposta de login sem token." }, { status: 502 });
  }

  const profileResponse = await fetch(`${BACKEND_URL}/users/me`, {
    headers: { Authorization: `Bearer ${payload.token}` },
    cache: "no-store",
  }).catch(() => null);

  const profile = profileResponse?.ok
    ? ((await profileResponse.json().catch(() => null)) as BackendProfile | null)
    : null;

  const tokenPayload = decodeJwtPayload(payload.token);
  const roleCandidates = [
    ...extractRoleCandidates(profile),
    ...extractRoleCandidates(tokenPayload),
  ];
  const role = getPrimaryRole(roleCandidates);
  const roles = roleCandidates
    .map(normalizeRole)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const nextResponse = NextResponse.json(
    {
      role,
      roles,
      name: typeof profile?.name === "string" && profile.name.trim() ? profile.name : "Administrador",
      email: typeof profile?.email === "string" ? profile.email : "",
      avatarUrl: typeof profile?.avatarUrl === "string" ? profile.avatarUrl : null,
      mustChangePassword: Boolean(profile?.mustChangePassword ?? tokenPayload?.mustChangePassword),
    },
    { status: response.status },
  );

  // Forward XSRF-TOKEN cookie from the login response so the browser has the
  // token immediately after signing in (before any subsequent GET request).
  forwardXsrfCookie(response, nextResponse);
  return nextResponse;
}
