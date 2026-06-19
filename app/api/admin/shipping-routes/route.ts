import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/shipping-routes");
  await relayAuthFailure(response);
  if (!response.ok) return jsonError("Nao foi possivel carregar rotas.", response.status);
  return NextResponse.json(await parseBackendJson(response));
}

export async function POST(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/shipping-routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await request.json()),
  });
  await relayAuthFailure(response);
  if (!response.ok) return jsonError(await response.text().catch(() => "Nao foi possivel criar rota."), response.status);
  return NextResponse.json(await parseBackendJson(response));
}
