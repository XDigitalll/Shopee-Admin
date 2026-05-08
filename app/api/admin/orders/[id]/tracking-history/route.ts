import { NextRequest, NextResponse } from "next/server";

import { fetchOrderDetailBundle } from "@/app/api/admin/orders/[id]/_shared";
import { getTrackingHistory } from "@/lib/admin/order-meta-store";
import type { TrackingHistoryEntry } from "@/lib/admin/types";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const result = await fetchOrderDetailBundle(request, id);

  if ("error" in result) {
    return result.error;
  }

  const deliveryFlow = (result.history ?? [])
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

  const manualUpdates = getTrackingHistory(id).map(
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
