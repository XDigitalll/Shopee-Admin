import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/finance/discounts/summary");

  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Nao foi possivel carregar o resumo de descontos.", response.status);
  }

  return NextResponse.json((await parseBackendJson(response)) ?? {});
}
