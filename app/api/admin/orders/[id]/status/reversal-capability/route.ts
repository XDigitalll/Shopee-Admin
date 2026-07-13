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

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(
    request,
    `/admin/orders/${encodeURIComponent(id)}/status/reversal-capability`
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Nao foi possivel verificar a reversao do estado.");
  }

  const payload = await parseBackendJson<unknown>(response);
  return NextResponse.json(payload);
}
