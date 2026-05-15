import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let sendEmail = false;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body === "object" && "sendEmail" in body) {
      sendEmail = Boolean(body.sendEmail);
    }
  } catch {
    // ignore parse errors — sendEmail stays false
  }

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const newPassword = Array.from(bytes, (value) => chars[value % chars.length]).join("");

  const response = await fetchBackend(request, `/super-admin/admins/${encodeURIComponent(id)}/password`, {
    method: "PUT",
    body: JSON.stringify({ newPassword, sendEmail }),
  });

  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return jsonError(payload?.message || "Nao foi possivel redefinir a senha do administrador.", response.status);
  }

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const payload = (await response.json().catch(() => null)) as {
    emailSent?: boolean;
    emailError?: string | null;
    [key: string]: unknown;
  } | null;

  return NextResponse.json({
    ...(payload && typeof payload === "object" ? payload : {}),
    generatedPassword: newPassword,
    emailSent: payload?.emailSent ?? false,
    emailError: payload?.emailError ?? null,
  });
}
