import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  jsonErrorPayload,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ALLOWED_TARGETS = new Set([
  "ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED",
  "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED",
]);

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

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    status?: string;
    reason?: string;
    expectedVersion?: number | null;
  } | null;

  const targetStatus = String(body?.status ?? "").trim().toUpperCase();

  if (targetStatus === "CANCELLED") {
    return jsonError(
      "O backend atual ainda nao expoe cancelamento administrativo direto para este pedido.",
      501
    );
  }

  if (!ALLOWED_TARGETS.has(targetStatus)) {
    return jsonError("A transicao pedida nao esta disponivel para o fluxo administrativo atual.", 400);
  }

  if (targetStatus === "DELIVERED") {
    const orderResponse = await fetchBackend(request, `/admin/orders/filters?orderId=${encodeURIComponent(id)}&page=0&size=1`);
    await relayAuthFailure(orderResponse);
    if (orderResponse.ok) {
      const orderPayload = await parseBackendJson<BackendOrderLookup>(orderResponse);
      const order = orderPayload?.content?.[0] ?? null;
      if (hasPendingDeliveryPayment(order)) {
        return jsonError("Este pedido ainda tem valor pendente. Resolve a cobranca antes de confirmar a entrega.", 409);
      }
    }
  }

  const response = await fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/transition`, {
    method: "PATCH",
    body: JSON.stringify({
      targetStatus,
      reason: body?.reason ?? null,
      expectedVersion: body?.expectedVersion ?? null,
    }),
    headers: { "Content-Type": "application/json" },
  });
  await relayAuthFailure(response);

  if (response.status === 409) {
    const payload = await parseBackendJson<{ message?: string; code?: string }>(response);
    return NextResponse.json(
      {
        message: payload?.message ?? "O pedido foi atualizado por outro administrador. Recarrega os dados.",
        code: payload?.code ?? "CONCURRENT_UPDATE",
      },
      { status: 409 }
    );
  }

  if (!response.ok) {
    const payload = await parseBackendJson<unknown>(response);
    return jsonErrorPayload(payload, response.status, "Nao foi possivel atualizar o estado do pedido.");
  }

  const result = await parseBackendJson<unknown>(response);
  return NextResponse.json(result);
}
