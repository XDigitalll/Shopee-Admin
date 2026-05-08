import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";

export async function POST(request: NextRequest) {
  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/users/invite", {
      method: "POST",
      body: await request.text(),
    });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao enviar convite.", response.status);
  }
  return NextResponse.json({ ok: true });
}
