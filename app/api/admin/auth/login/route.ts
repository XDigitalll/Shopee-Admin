import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_REFRESH_COOKIE, ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const isSecure = process.env.NODE_ENV === "production";

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
    cookieStore.set(ADMIN_SESSION_COOKIE, payload.token, adminCookieOpts(true, 86_400));
    cookieStore.set(ADMIN_REFRESH_COOKIE, payload.refreshToken, adminCookieOpts(true, 2_592_000));
  }

  return NextResponse.json(payload, { status: response.status });
}
