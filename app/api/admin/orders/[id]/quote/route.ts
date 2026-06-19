import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import type { QuoteSubmissionPayload } from "@/lib/admin/types";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ExistingOrderResponse = {
  activeQuote?: unknown | null;
};

function normalizePayload(payload: QuoteSubmissionPayload) {
  const normalized: Record<string, number | string | null> = {
    baseAmount: Number(payload.baseAmount || 0),
    routeId: payload.routeId ?? null,
    shippingFee: Number(payload.shippingFee || 0),
    currency: payload.currency || "ZAR",
    commissionPercentage: Number(payload.commissionPercentage || 0),
    returnRiskPercentage: Number(payload.returnRiskPercentage || 0),
    operationalCostPercentage: Number(payload.operationalCostPercentage || 0),
    urgentPercentage: 0,
    urgentAmount: 0,
  };

  if (payload.exchangeRate != null) {
    normalized.exchangeRate = Number(payload.exchangeRate || 0);
  }

  return normalized;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as QuoteSubmissionPayload;

  const detailResponse = await fetchBackend(
    request,
    `/admin/orders/filters?orderId=${encodeURIComponent(id)}&page=0&size=1`
  );
  await relayAuthFailure(detailResponse);

  if (!detailResponse.ok) {
    return jsonError("Não foi possível carregar o pedido antes de enviar a cotação.", detailResponse.status);
  }

  const detailPayload = await parseBackendJson<{ content?: ExistingOrderResponse[] }>(detailResponse);
  const order = detailPayload?.content?.[0];
  const endpoint = order?.activeQuote
    ? `/admin/orders/${encodeURIComponent(id)}/quote/update`
    : `/admin/orders/${encodeURIComponent(id)}/quote`;

  const response = await fetchBackend(request, endpoint, {
    method: order?.activeQuote ? "PUT" : "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizePayload(body)),
  });
  await relayAuthFailure(response);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const action = order?.activeQuote ? "actualizar" : "enviar";
    return jsonError(errorText || `Não foi possível ${action} a cotação.`, response.status);
  }

  // Clear the persisted draft asynchronously — best effort
  void fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/quote-draft`, { method: "DELETE" });
  return NextResponse.json(await response.json().catch(() => null));
}
