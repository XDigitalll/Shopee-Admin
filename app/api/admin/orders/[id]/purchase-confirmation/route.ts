import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonErrorPayload,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const body = await request.json();

  const backendResponse = await fetchBackend(
    request,
    `/admin/orders/${encodeURIComponent(id)}/purchase-confirmation`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  await relayAuthFailure(backendResponse);

  if (!backendResponse.ok) {
    const payload = await parseBackendJson<unknown>(backendResponse);
    return jsonErrorPayload(payload, backendResponse.status, "Nao foi possivel confirmar a compra.");
  }

  const payload = await parseBackendJson<unknown>(backendResponse);
  return NextResponse.json(payload);
}
