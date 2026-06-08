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

  const backendResponse = await fetchBackend(
    request,
    `/admin/orders/${encodeURIComponent(id)}/purchase-proof/publish`,
    {
      method: "POST",
      body: request.body,
    },
  );
  await relayAuthFailure(backendResponse);

  if (!backendResponse.ok) {
    const payload = await parseBackendJson<unknown>(backendResponse);
    return jsonErrorPayload(payload, backendResponse.status, "Nao foi possivel enviar o comprovativo ao cliente.");
  }

  const payload = await parseBackendJson<unknown>(backendResponse);
  return NextResponse.json(payload);
}
