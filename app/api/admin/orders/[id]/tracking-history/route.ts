import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import { fetchOrderDetailBundle } from "@/app/api/admin/orders/[id]/_shared";
import type { TrackingHistoryEntry } from "@/lib/admin/types";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const [bundleResult, trackingResponse] = await Promise.all([
    fetchOrderDetailBundle(request, id),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/tracking`),
  ]);
  await relayAuthFailure(trackingResponse);

  if ("error" in bundleResult) {
    return bundleResult.error;
  }

  const trackingPayload = trackingResponse.ok
    ? await parseBackendJson<{ history?: { id: string; at: string; description: string }[] }>(trackingResponse)
    : null;

  const deliveryFlow = (bundleResult.history ?? [])
    .filter((entry) =>
      ["Pedido em trânsito", "Pedido chegou a nossa sede", "Saiu para entrega", "Pedido entregue"].includes(
        entry.label
      ) && entry.date
    )
    .map(
      (entry): TrackingHistoryEntry => ({
        id: entry.id,
        date: entry.date ?? new Date().toISOString(),
        description: entry.description || entry.label,
      })
    );

  const manualUpdates = (trackingPayload?.history ?? []).map(
    (entry): TrackingHistoryEntry => ({
      id: entry.id,
      date: entry.at,
      description: entry.description,
    })
  );

  const history = [...manualUpdates, ...deliveryFlow].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
  );

  return NextResponse.json(history);
}
