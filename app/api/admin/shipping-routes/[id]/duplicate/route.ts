import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(request, `/admin/shipping-routes/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
  });
  await relayAuthFailure(response);
  if (!response.ok) return jsonError(await response.text().catch(() => "Nao foi possivel duplicar rota."), response.status);
  return NextResponse.json(await parseBackendJson(response));
}
