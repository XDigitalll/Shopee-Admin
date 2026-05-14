import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function relayExchangeRateResponse(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
  fallbackMessage = "Nao foi possivel processar o cambio.",
) {
  const response = await fetchBackend(request, path, init);
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : fallbackMessage;
    return jsonError(message, response.status);
  }

  return NextResponse.json(payload);
}
