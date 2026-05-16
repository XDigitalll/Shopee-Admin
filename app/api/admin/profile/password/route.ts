import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

export async function PUT(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const currentPassword = typeof payload?.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword : "";

  const response = currentPassword.trim()
    ? await fetchBackend(request, "/users/me/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })
    : await fetchBackend(request, "/auth/force-change-password", {
        method: "POST",
        body: JSON.stringify({
          newPassword,
          confirmPassword: newPassword,
        }),
      });

  await relayAuthFailure(response);

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(errorPayload?.message || "Nao foi possivel alterar a senha.", response.status);
  }

  return new NextResponse(null, { status: 204 });
}
