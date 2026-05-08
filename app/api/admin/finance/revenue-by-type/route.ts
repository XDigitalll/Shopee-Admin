import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendFinanceStats = {
  totalRevenue?: number;
  totalCommission?: number;
};

type BackendDashboard = {
  internalSales?: number;
  externalSales?: number;
  totalSiteRevenue?: number;
};

export async function GET(request: NextRequest) {
  const period = new URL(request.url).searchParams.get("period") ?? "month";

  const [statsResponse, dashboardResponse] = await Promise.all([
    fetchBackend(request, `/admin/finance/stats?period=${period}`),
    fetchBackend(request, "/admin/dashboard"),
  ]);
  await relayAuthFailure(statsResponse);

  if (!statsResponse.ok && !dashboardResponse.ok) {
    return jsonError("Não foi possível carregar receita por tipo.", statsResponse.status);
  }

  const stats = statsResponse.ok
    ? await parseBackendJson<BackendFinanceStats>(statsResponse)
    : null;

  const dashboard = dashboardResponse.ok
    ? await parseBackendJson<BackendDashboard>(dashboardResponse)
    : null;

  return NextResponse.json({
    external: Number(dashboard?.externalSales ?? stats?.totalRevenue ?? 0),
    internal: Number(dashboard?.internalSales ?? 0),
    commissions: Number(stats?.totalCommission ?? dashboard?.totalSiteRevenue ?? 0),
  });
}
