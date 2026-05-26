import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendCostBreakdown = {
  totalSiteTax?: number;
  totalExternalCommission?: number;
  totalInsurance?: number;
  totalCustoms?: number;
  totalOperationalCost?: number;
};

type BackendStats = {
  totalDelivery?: number;
};

type BackendDashboard = {
  totalDeliveryRevenue?: number;
};

export async function GET(request: NextRequest) {
  const [response, statsResponse, dashboardResponse] = await Promise.all([
    fetchBackend(request, "/admin/finance/cost-breakdown"),
    fetchBackend(request, "/admin/finance/stats?period=month"),
    fetchBackend(request, "/admin/dashboard"),
  ]);

  await Promise.all([
    relayAuthFailure(response),
    relayAuthFailure(statsResponse),
    relayAuthFailure(dashboardResponse),
  ]);

  if (!response.ok && !statsResponse.ok && !dashboardResponse.ok) {
    return jsonError("Nao foi possivel carregar a decomposicao de custos.", response.status);
  }

  const d = response.ok ? ((await parseBackendJson<BackendCostBreakdown>(response)) ?? {}) : {};
  const stats = statsResponse.ok ? ((await parseBackendJson<BackendStats>(statsResponse)) ?? {}) : {};
  const dashboard = dashboardResponse.ok ? ((await parseBackendJson<BackendDashboard>(dashboardResponse)) ?? {}) : {};

  return NextResponse.json({
    siteTax: Number(d.totalSiteTax ?? 0),
    externalCommission: Number(d.totalExternalCommission ?? 0),
    delivery: Number(dashboard.totalDeliveryRevenue ?? stats.totalDelivery ?? 0),
    insurance: Number(d.totalInsurance ?? 0),
    customs: Number(d.totalCustoms ?? 0),
    operational: Number(d.totalOperationalCost ?? 0),
  });
}
