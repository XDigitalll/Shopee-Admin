import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendKPIs = {
  averageTicket?: number;
  cancellationRate?: number;
  externalRevenueShare?: number;
  pendingPaymentsCount?: number;
};

export async function GET(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/finance/kpis");
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Não foi possível carregar KPIs.", response.status);
  }

  const k = await parseBackendJson<BackendKPIs>(response);
  const cancellationRate = Number(k.cancellationRate ?? 0);
  const externalShare = Number(k.externalRevenueShare ?? 0);

  return NextResponse.json({
    avgMargin: externalShare,
    avgMarginTrend: externalShare > 30 ? "up" : externalShare > 10 ? "neutral" : "down",
    conversionRate: 100 - cancellationRate,
    conversionRateTrend: cancellationRate < 5 ? "up" : cancellationRate < 15 ? "neutral" : "down",
    avgQuoteTime: 0,
    avgQuoteTimeTrend: "neutral",
    cancelledOrders: Number(k.pendingPaymentsCount ?? 0),
    cancelledOrdersTrend: "neutral",
  });
}
