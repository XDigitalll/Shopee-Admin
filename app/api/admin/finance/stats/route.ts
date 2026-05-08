import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, jsonError, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";

type BackendStats = {
  totalRevenue?: number;
  todayRevenue?: number;
  revenueGrowth?: number;
  totalOrders?: number;
  todayOrders?: number;
  totalCommission?: number;
  todayCommission?: number;
  totalDelivery?: number;
  todayDelivery?: number;
  pendingPayments?: number;
};

type BackendDashboard = {
  totalSales?: number;
  todaySales?: number;
  totalMerchandiseValue?: number;
  todayMerchandiseValue?: number;
  totalSiteRevenue?: number;
  todaySiteRevenue?: number;
  totalDeliveryRevenue?: number;
  todayDeliveryRevenue?: number;
  totalEstimatedMargin?: number;
  todayEstimatedMargin?: number;
  siteRevenueSharePercentage?: number;
  todaySiteRevenueSharePercentage?: number;
  averageTicket?: number;
  paidOrdersToday?: number;
  internalSales?: number;
  externalSales?: number;
  internalSalesToday?: number;
  externalSalesToday?: number;
  paidInternalOrders?: number;
  paidExternalOrders?: number;
};

export async function GET(request: NextRequest) {
  const period = new URL(request.url).searchParams.get("period") ?? "month";
  const [statsRes, kpisRes, dashRes] = await Promise.all([
    fetchBackend(request, `/admin/finance/stats?period=${period}`),
    fetchBackend(request, "/admin/finance/kpis"),
    fetchBackend(request, "/admin/dashboard"),
  ]);

  await relayAuthFailure(statsRes);

  const s: BackendStats = statsRes.ok
    ? (await parseBackendJson<BackendStats>(statsRes)) ?? {}
    : {};

  const kpis: { averageTicket?: number } = kpisRes.ok
    ? (await parseBackendJson<{ averageTicket?: number }>(kpisRes)) ?? {}
    : {};

  const d: BackendDashboard = dashRes.ok
    ? (await parseBackendJson<BackendDashboard>(dashRes)) ?? {}
    : {};

  // If all three calls failed, relay the auth error
  if (!statsRes.ok && !kpisRes.ok && !dashRes.ok) {
    return jsonError("Não foi possível carregar estatísticas financeiras.", statsRes.status);
  }

  const totalRevenue = Number(s.totalRevenue ?? d.totalSales ?? 0);
  const todayRevenue = Number(s.todayRevenue ?? d.todaySales ?? 0);
  const growth = Number(s.revenueGrowth ?? 0);
  const commission = Number(s.totalCommission ?? d.totalSiteRevenue ?? 0);
  const todayCommission = Number(s.todayCommission ?? d.todaySiteRevenue ?? 0);
  const commissionDelta = commission > 0 ? (todayCommission / commission) * 100 : 0;

  const totalMerchandise = Number(d.totalMerchandiseValue ?? (totalRevenue - commission - Number(s.totalDelivery ?? d.totalDeliveryRevenue ?? 0)));
  const todayMerchandise = Number(d.todayMerchandiseValue ?? (todayRevenue - todayCommission - Number(s.todayDelivery ?? d.todayDeliveryRevenue ?? 0)));
  const totalDelivery = Number(d.totalDeliveryRevenue ?? s.totalDelivery ?? 0);
  const todayDelivery = Number(d.todayDeliveryRevenue ?? s.todayDelivery ?? 0);
  const totalMargin = Number(d.totalEstimatedMargin ?? (commission + totalDelivery));
  const todayMargin = Number(d.todayEstimatedMargin ?? (todayCommission + todayDelivery));
  const siteSharePct = Number(d.siteRevenueSharePercentage ?? (totalRevenue > 0 ? (commission / totalRevenue) * 100 : 0));
  const todaySiteSharePct = Number(d.todaySiteRevenueSharePercentage ?? (todayRevenue > 0 ? (todayCommission / todayRevenue) * 100 : 0));

  return NextResponse.json({
    totalRevenue,
    todayRevenue,
    totalRevenueDelta: Number(growth.toFixed(2)),
    commissionsEarned: commission,
    commissionsEarnedDelta: Number(commissionDelta.toFixed(2)),
    paidOrders: Number(s.totalOrders ?? 0),
    paidOrdersDelta: Number(s.todayOrders ?? 0),
    avgTicket: Number((kpis as { averageTicket?: number }).averageTicket ?? d.averageTicket ?? 0),
    avgTicketDelta: 0,
    totalMerchandise,
    todayMerchandise,
    totalSiteRevenue: commission,
    todaySiteRevenue: todayCommission,
    totalDelivery,
    todayDelivery,
    totalMargin,
    todayMargin,
    siteSharePct: Number(siteSharePct.toFixed(2)),
    todaySiteSharePct: Number(todaySiteSharePct.toFixed(2)),
    paidOrdersToday: Number(d.paidOrdersToday ?? s.todayOrders ?? 0),
    internalSales: Number(d.internalSales ?? 0),
    externalSales: Number(d.externalSales ?? 0),
    internalSalesToday: Number(d.internalSalesToday ?? 0),
    externalSalesToday: Number(d.externalSalesToday ?? 0),
    paidInternalOrders: Number(d.paidInternalOrders ?? 0),
    paidExternalOrders: Number(d.paidExternalOrders ?? 0),
  });
}
