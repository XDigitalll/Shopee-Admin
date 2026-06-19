import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(request, `/admin/shipping-locations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await request.json()),
  });
  await relayAuthFailure(response);
  if (!response.ok) return jsonError(await response.text().catch(() => "Nao foi possivel actualizar local."), response.status);
  return NextResponse.json(await parseBackendJson(response));
}
