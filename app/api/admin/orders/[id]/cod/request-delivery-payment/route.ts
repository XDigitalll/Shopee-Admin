import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { method?: string | null } | null;
  const requestedMethod = String(body?.method ?? "").trim().toUpperCase();
  const requestPayload = requestedMethod ? { method: requestedMethod } : undefined;

  const response = await fetchBackend(
    request,
    `/admin/delivery/orders/${encodeURIComponent(id)}/collection`,
    {
      method: "POST",
      body: JSON.stringify({ method: "PAYSUITE", ...(requestPayload ?? {}) }),
      headers: { "Content-Type": "application/json" },
    }
  );
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Nao foi possivel solicitar pagamento na entrega.";
    return jsonError(message, response.status);
  }

  return NextResponse.json(payload);
}
