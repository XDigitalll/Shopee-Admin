import { NextRequest, NextResponse } from "next/server";

import {
  prependTrackingHistory,
  saveTrackingMeta,
  type TrackingCarrier,
} from "@/lib/admin/order-meta-store";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    trackingCode?: string;
    carrier?: string;
    estimatedDelivery?: string;
    trackingUrl?: string;
  } | null;

  const trackingCode = String(body?.trackingCode ?? "").trim();
  const carrier = String(body?.carrier ?? "").trim().toUpperCase() as TrackingCarrier | "";
  const estimatedDelivery = String(body?.estimatedDelivery ?? "").trim();
  const trackingUrl = String(body?.trackingUrl ?? "").trim();

  const next = saveTrackingMeta(id, {
    trackingCode,
    carrier,
    estimatedDelivery,
    trackingUrl,
  });

  const updateParts = [
    trackingCode ? `Código ${trackingCode}` : null,
    carrier ? `transportador ${carrier === "OTHER" ? "Outro" : carrier}` : null,
    estimatedDelivery ? `entrega estimada para ${estimatedDelivery}` : null,
  ].filter(Boolean);

  if (updateParts.length) {
    prependTrackingHistory(id, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      description: `Rastreio actualizado: ${updateParts.join(", ")}.`,
    });
  }

  return NextResponse.json({ saved: true, ...next });
}
