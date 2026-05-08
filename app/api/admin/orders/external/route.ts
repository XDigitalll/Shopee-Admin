import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("Dados invalidos para criar o pedido externo.", 400);
  }

  const response = await fetchBackend(request, "/orders/external", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  await relayAuthFailure(response);

  const payload = await parseBackendJson<{ id?: number; message?: string }>(response);

  if (!response.ok) {
    return jsonError(
      payload?.message || "Nao foi possivel criar o pedido externo com o backend atual.",
      response.status
    );
  }

  return NextResponse.json(payload);
}
