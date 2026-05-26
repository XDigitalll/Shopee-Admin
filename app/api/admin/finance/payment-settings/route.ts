import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/finance/payment-settings");
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);
  if (!response.ok) {
    return jsonErrorPayload(payload, response.status, "Nao foi possivel carregar configuracoes de pagamento.");
  }

  return NextResponse.json(payload);
}

export async function PUT(request: NextRequest) {
  const body = await request.text();
  const response = await fetchBackend(request, "/admin/finance/payment-settings", {
    method: "PUT",
    body,
  });
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);
  if (!response.ok) {
    return jsonErrorPayload(payload, response.status, "Nao foi possivel guardar configuracoes de pagamento.");
  }

  return NextResponse.json(payload);
}
