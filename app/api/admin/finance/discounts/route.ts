import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const response = await fetchBackend(request, `/admin/finance/discounts${qs ? `?${qs}` : ""}`);

  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Nao foi possivel carregar os descontos financeiros.", response.status);
  }

  return NextResponse.json((await parseBackendJson(response)) ?? []);
}
