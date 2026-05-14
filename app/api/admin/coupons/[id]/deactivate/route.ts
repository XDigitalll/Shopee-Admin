import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/coupons/${encodeURIComponent(id)}/deactivate`, { method: "PATCH" });
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao desativar cupão.", response.status);
  }
  return NextResponse.json(await parseBackendJson(response));
}
