import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

function getExpiresAtMs(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
    ) as Record<string, unknown>;
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });
  }

  const backendResponse = await fetch(`${BACKEND_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);

  if (!backendResponse || !backendResponse.ok) {
    return NextResponse.json({ message: "Sessao invalida ou expirada." }, { status: 401 });
  }

  const profile = await backendResponse.json().catch(() => null);
  return NextResponse.json({ ...profile, expiresAt: getExpiresAtMs(token) });
}
