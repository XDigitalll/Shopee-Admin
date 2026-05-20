import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/work-queue/summary");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Nao foi possivel carregar a fila operacional.", response.status);
  }

  const payload = await parseBackendJson<unknown>(response);
  return NextResponse.json(payload);
}
