import { NextRequest, NextResponse } from "next/server";
import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/coupons/stats");
  } catch {
    return jsonError("Backend inacessível.", 502);
  }
  await relayAuthFailure(response);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return jsonError(payload?.message || "Erro ao carregar resumo de cupões.", response.status);
  }
  return NextResponse.json(await parseBackendJson(response));
}
