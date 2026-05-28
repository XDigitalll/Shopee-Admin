import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function hasReachedTarget(currentStatus: string, targetStatus: string) {
  if (currentStatus === targetStatus) {
    return true;
  }

  if (targetStatus === "ORDERED") {
    return ["ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(currentStatus);
  }

  if (targetStatus === "PURCHASED") {
    return ["PURCHASED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(currentStatus);
  }

  return false;
}

const ALLOWED_TARGETS = ["ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
const ALLOWED_PROGRESSION = ["PAID", "TO_PURCHASE", "ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: string } | null;

  if (body?.status === "CANCELLED") {
    return jsonError(
      "O backend atual ainda nao expoe cancelamento administrativo direto para este pedido.",
      501
    );
  }

  if (!ALLOWED_TARGETS.includes(String(body?.status) as (typeof ALLOWED_TARGETS)[number])) {
    return jsonError("A transicao pedida nao esta disponivel para o fluxo administrativo atual.", 400);
  }

  const detailResponse = await fetchBackend(
    request,
    `/admin/orders/filters?orderId=${encodeURIComponent(id)}&page=0&size=1`
  );
  await relayAuthFailure(detailResponse);
  if (!detailResponse.ok) {
    return jsonError("Nao foi possivel carregar o estado atual do pedido.", detailResponse.status);
  }

  const detailPayload = await parseBackendJson<{ content?: Array<{ status?: string | null; orderStatus?: string | null; fulfillmentStatus?: string | null; deliveryMethod?: string | null }> }>(
    detailResponse
  );
  const currentOrder = detailPayload?.content?.[0];
  let currentStatus = String(currentOrder?.orderStatus ?? currentOrder?.fulfillmentStatus ?? currentOrder?.status ?? "");
  const targetStatus = String(body?.status);
  if (currentOrder?.deliveryMethod === "STORE_PICKUP" && targetStatus === "DELIVERED" && currentStatus !== "READY_FOR_DELIVERY") {
    return jsonError("Este pedido ainda nao pode ser levantado porque o pagamento nao foi aprovado ou o pedido nao esta pronto para levantamento.", 400);
  }
  if (!ALLOWED_PROGRESSION.includes(currentStatus as (typeof ALLOWED_PROGRESSION)[number])) {
    return jsonError("O estado atual do pedido nao suporta esta transicao administrativa.", 400);
  }

  let latestPayload: unknown = null;
  let guard = 0;

  while (!hasReachedTarget(currentStatus, targetStatus) && guard < 6) {
    const response = await fetchBackend(request, `/admin/orders/${id}/advance`, {
      method: "PATCH",
    });
    await relayAuthFailure(response);

    if (!response.ok) {
      return jsonError("Nao foi possivel atualizar o estado do pedido.", response.status);
    }

    latestPayload = await response.json().catch(() => null);
    currentStatus = String(
      latestPayload &&
        typeof latestPayload === "object" &&
        "status" in latestPayload &&
        typeof latestPayload.status === "string"
        ? latestPayload.status
        : currentStatus
    );
    guard += 1;
  }

  if (!hasReachedTarget(currentStatus, targetStatus)) {
    return jsonError("Nao foi possivel atingir o estado pretendido com o backend atual.", 409);
  }

  return NextResponse.json(latestPayload);
}
