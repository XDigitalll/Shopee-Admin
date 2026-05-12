import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const response = await fetchBackend(request, `/admin/payment-submissions${url.search}`);
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Nao foi possivel carregar as submissoes de pagamento.";
    return jsonError(message, response.status);
  }

  return NextResponse.json(payload);
}
