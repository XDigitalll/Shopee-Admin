import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, jsonErrorPayload, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { TrackingMeta } from "@/lib/admin/order-meta-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const response = await fetchBackend(_, `/admin/orders/${encodeURIComponent(id)}/tracking`);
  await relayAuthFailure(response);
  if (!response.ok) {
    return jsonError("Não foi possível carregar o rastreio.", response.status);
  }
  const payload = await parseBackendJson<TrackingMeta>(response);
  return NextResponse.json(payload ?? { trackingCode: "", carrier: "", estimatedDelivery: "", trackingUrl: "", history: [] });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const response = await fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/tracking`, {
    method: "PUT",
    body: JSON.stringify(body ?? {}),
    headers: { "Content-Type": "application/json" },
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Não foi possível guardar o rastreio.");
  }

  const saved = await parseBackendJson<TrackingMeta>(response);
  return NextResponse.json({ saved: true, ...(saved ?? {}) });
}
