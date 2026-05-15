import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_REFRESH_COOKIE, ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const isSecure = process.env.NODE_ENV === "production";

function adminCookieOpts(httpOnly: boolean, maxAge: number) {
  return { httpOnly, secure: isSecure, sameSite: "lax" as const, path: "/", maxAge };
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  let refreshToken: string | undefined;
  let rawBody = "";

  try {
    rawBody = await request.text();
    const parsed = JSON.parse(rawBody) as { refreshToken?: string };
    if (parsed.refreshToken?.trim()) {
      refreshToken = parsed.refreshToken.trim();
    }
  } catch {
    // No body
  }

  if (!refreshToken) {
    refreshToken = cookieStore.get(ADMIN_REFRESH_COOKIE)?.value;
  }

  if (!refreshToken) {
    return NextResponse.json({ message: "Sem token de renovacao disponivel." }, { status: 401 });
  }

  const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const isAuthError = response.status === 401 || response.status === 403;
    if (isAuthError) {
      // Session truly invalid — clear both cookies so the client restarts auth.
      cookieStore.set(ADMIN_SESSION_COOKIE, "", adminCookieOpts(true, 0));
      cookieStore.set(ADMIN_REFRESH_COOKIE, "", adminCookieOpts(true, 0));
    }
    // On 5xx/network errors we preserve cookies so the client can retry later.
    return NextResponse.json(
      {
        message:
          (payload &&
            typeof payload === "object" &&
            "message" in payload &&
            typeof payload.message === "string" &&
            payload.message) ||
          (isAuthError
            ? "A tua sessao expirou. Entra novamente."
            : "Nao foi possivel renovar a sessao. Tenta mais tarde."),
      },
      { status: response.status }
    );
  }

  if (payload?.token && payload?.refreshToken) {
    cookieStore.set(ADMIN_SESSION_COOKIE, payload.token, adminCookieOpts(true, 86_400));
    cookieStore.set(ADMIN_REFRESH_COOKIE, payload.refreshToken, adminCookieOpts(true, 2_592_000));
  }

  return NextResponse.json(payload, { status: response.status });
}
