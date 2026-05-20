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
  const response = await fetchBackend(
    request,
    `/admin/orders/${encodeURIComponent(id)}/mark-ready-for-delivery`,
    {
      method: "PATCH",
    }
  );
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "Nao foi possivel mandar o pedido para entrega.";
    return jsonError(message, response.status);
  }

  return NextResponse.json(payload);
}
