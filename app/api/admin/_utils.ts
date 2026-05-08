import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

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

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
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
