import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function readBackendMessage(response: Response, fallback: string) {
  const payload = (await response.clone().json().catch(() => null)) as { message?: string; error?: string } | null;
  if (payload?.message) return payload.message;
  if (payload?.error) return payload.error;

  const text = await response.text().catch(() => "");
  return text.trim() || fallback;
}

type BackendOrderLookup = {
  content?: Array<{
    remainingAmountOnDelivery?: number | null;
    deliveryPaymentStatus?: string | null;
    payment?: {
      status?: string | null;
    } | null;
  }>;
};

function hasPendingDeliveryPayment(order: NonNullable<BackendOrderLookup["content"]>[number] | null | undefined) {
  if (!order) return false;

  const remainingAmount = Number(order.remainingAmountOnDelivery ?? 0);
  const deliveryPaymentStatus = String(order.deliveryPaymentStatus ?? "").toUpperCase();
  const paymentStatus = String(order.payment?.status ?? "").toUpperCase();
  const resolvedStatuses = new Set(["SUCCESS", "VALIDATED", "CONFIRMED", "APPROVED", "COD_COLLECTED", "RECEIVED", "PAID"]);

  return (
    remainingAmount > 0
    || deliveryPaymentStatus === "PENDING"
    || paymentStatus === "COD_PENDING"
  ) && !resolvedStatuses.has(paymentStatus) && deliveryPaymentStatus !== "RECEIVED" && deliveryPaymentStatus !== "WAIVED";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let response: Response;
  try {
    const orderResponse = await fetchBackend(request, `/admin/orders/filters?orderId=${encodeURIComponent(id)}&page=0&size=1`);
    await relayAuthFailure(orderResponse);
    if (orderResponse.ok) {
      const orderPayload = await parseBackendJson<BackendOrderLookup>(orderResponse);
      const order = orderPayload?.content?.[0] ?? null;
      if (hasPendingDeliveryPayment(order)) {
        return jsonError("Este pedido ainda tem valor pendente. Resolve a cobranca antes de confirmar a entrega.", 409);
      }
    }

    response = await fetchBackend(request, `/admin/delivery/active/${id}/complete`, {
      method: "POST",
    });
    await relayAuthFailure(response);
  } catch {
    return jsonError("Backend inacessivel. Confirma se o Spring Boot esta a correr na porta 8080.", 502);
  }

  if (!response.ok) {
    return jsonError(
      await readBackendMessage(response, "Nao foi possivel concluir a entrega."),
      response.status
    );
  }

  return NextResponse.json({ ok: true });
}
