import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import { XSRF_COOKIE, XSRF_HEADER } from "@/lib/admin/csrf";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

function getToken(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  return request.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
}

export async function fetchBackend(
  request: NextRequest,
  path: string,
  init: RequestInit = {}
) {
  const token = getToken(request);
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const contentType = request.headers.get("content-type");
  if (contentType && !headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }

  // Forward X-XSRF-TOKEN header from browser to Spring Boot
  const xsrfToken = request.headers.get(XSRF_HEADER.toLowerCase()) ??
    request.headers.get(XSRF_HEADER);
  if (xsrfToken) {
    headers.set(XSRF_HEADER, xsrfToken);
  }

  // Forward XSRF-TOKEN cookie from browser to Spring Boot
  const xsrfCookie = request.cookies.get(XSRF_COOKIE)?.value;
  if (xsrfCookie) {
    const existingCookie = headers.get("Cookie") ?? "";
    const xsrfCookiePair = `${XSRF_COOKIE}=${xsrfCookie}`;
    headers.set("Cookie", existingCookie ? `${existingCookie}; ${xsrfCookiePair}` : xsrfCookiePair);
  }

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

/**
 * Copies the XSRF-TOKEN Set-Cookie header from a Spring Boot response into
 * a Next.js response so the browser receives (and can read) the CSRF token.
 * Spring Boot's CookieCsrfTokenRepository already sets HttpOnly=false, so no
 * stripping is needed — we forward the header as-is.
 */
export function forwardXsrfCookie(backendResponse: Response, nextResponse: NextResponse): void {
  // fetch() collapses duplicate headers; getSetCookie() (Node 18+) returns all values
  const setCookieValues: string[] =
    typeof backendResponse.headers.getSetCookie === "function"
      ? backendResponse.headers.getSetCookie()
      : backendResponse.headers.get("set-cookie")
        ? [backendResponse.headers.get("set-cookie")!]
        : [];

  for (const value of setCookieValues) {
    if (value.startsWith(`${XSRF_COOKIE}=`)) {
      nextResponse.headers.append("Set-Cookie", value);
    }
  }
}

export async function parseBackendJson<T>(response: Response) {
  if (response.status === 204) {
    return null as T;
  }

  return (await response.json().catch(() => null)) as T;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function relayAuthFailure(response: Response) {
  if (response.status === 401) {
    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_SESSION_COOKIE);
  }
}
