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
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const response = await fetchBackend(
    request,
    `/admin/delivery/orders/${encodeURIComponent(id)}/collection`,
    {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "Content-Type": "application/json" },
    }
  );
  await relayAuthFailure(response);

  const payload = await parseBackendJson<unknown>(response);
  if (!response.ok) {
    return jsonErrorPayload(payload, response.status, "Nao foi possivel criar a cobranca da entrega.");
  }

  return NextResponse.json(payload);
}
