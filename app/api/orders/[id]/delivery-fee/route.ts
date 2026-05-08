import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, relayAuthFailure } from "@/app/api/admin/_utils";
import { saveDeliveryPricing } from "@/lib/admin/delivery-meta-store";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    deliveryFee?: number;
    estimatedDeliveryTime?: number | null;
    notes?: string | null;
  } | null;

  const deliveryFee = Number(payload?.deliveryFee ?? 0);
  if (!Number.isFinite(deliveryFee) || deliveryFee <= 0) {
    return jsonError("Define uma taxa de entrega valida antes de notificar o cliente.", 400);
  }

  const estimatedDeliveryTime = payload?.estimatedDeliveryTime == null
    ? null
    : Number(payload.estimatedDeliveryTime);
  const notes = typeof payload?.notes === "string" ? payload.notes.trim() : null;

  let response: Response;
  try {
    response = await fetchBackend(request, `/admin/delivery/pending/${id}/delivery-fee`, {
      method: "PUT",
      body: JSON.stringify({
        deliveryFee,
        estimatedDeliveryTime,
        notes,
      }),
    });
    await relayAuthFailure(response);
  } catch {
    return jsonError("Backend inacessivel. Confirma se o Spring Boot esta a correr na porta 8080.", 502);
  }

  if (!response.ok) {
    const backendPayload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    return jsonError(
      backendPayload?.message || backendPayload?.error || "Nao foi possivel definir a taxa de entrega.",
      response.status,
    );
  }

  saveDeliveryPricing(Number(id), {
    deliveryFee,
    estimatedDeliveryHours: estimatedDeliveryTime,
    notes,
  });

  return NextResponse.json({ ok: true });
}
