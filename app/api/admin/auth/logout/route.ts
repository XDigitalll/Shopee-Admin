import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_REFRESH_COOKIE, ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import { fetchBackend } from "@/app/api/admin/_utils";

export async function POST(request: NextRequest) {
  const body = await request.text().catch(() => "");

  try {
    await fetchBackend(request, "/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
  } finally {
    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_SESSION_COOKIE);
    cookieStore.delete(ADMIN_REFRESH_COOKIE);
  }

  return new NextResponse(null, { status: 204 });
}
