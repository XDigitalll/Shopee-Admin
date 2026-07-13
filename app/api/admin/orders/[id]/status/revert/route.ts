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
  const body = await request.text();
  const response = await fetchBackend(
    request,
    `/admin/orders/${encodeURIComponent(id)}/status/revert`,
    {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    }
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Nao foi possivel reverter o estado do pedido.");
  }

  const payload = await parseBackendJson<unknown>(response);
  return NextResponse.json(payload);
}
