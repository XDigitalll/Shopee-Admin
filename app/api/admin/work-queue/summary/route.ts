import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

export async function GET(request: NextRequest) {
  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/work-queue/summary");
    await relayAuthFailure(response);
  } catch (error) {
    return NextResponse.json({
      orders: 0,
      externalQuotes: 0,
      payments: 0,
      delivery: 0,
      customers: 0,
      orphanOrders: 0,
      executionCount: 0,
      prepareProductCount: 0,
      internalOrdersNeedingAction: 0,
      internalCodPrepareCount: 0,
      paymentPendingCount: 0,
      manualPaymentReviewCount: 0,
      paysuitePendingCount: 0,
      degraded: true,
      error: error instanceof Error ? error.message : "Fila operacional temporariamente indisponivel.",
    }, { status: 200 });
  }

  if (!response.ok) {
    return NextResponse.json({
      orders: 0,
      externalQuotes: 0,
      payments: 0,
      delivery: 0,
      customers: 0,
      orphanOrders: 0,
      executionCount: 0,
      prepareProductCount: 0,
      internalOrdersNeedingAction: 0,
      internalCodPrepareCount: 0,
      paymentPendingCount: 0,
      manualPaymentReviewCount: 0,
      paysuitePendingCount: 0,
      degraded: true,
      error: "Fila operacional temporariamente indisponivel.",
    }, { status: 200 });
  }

  const payload = await parseBackendJson<unknown>(response);
  return NextResponse.json(payload);
}
