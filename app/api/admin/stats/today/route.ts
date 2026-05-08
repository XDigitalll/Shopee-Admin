import { NextRequest, NextResponse } from "next/server";

import { fetchBackend, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import type { TodayStatsResponse } from "@/lib/admin/types";

type BackendDashboard = {
  totalOrders?: number;
  todayOrders?: number;
  paidOrdersToday?: number;
  todaySales?: number;
  weeklySales?: number;
  todayEstimatedMargin?: number;
  internalUnderReviewOrders?: number | null;
  internalPendingPaymentOrders?: number | null;
  externalOperationalOrders?: number | null;
  externalCreatedOrders?: number | null;
  externalUnderReviewOrders?: number | null;
  externalQuotedOrders?: number | null;
  internalDeliveryActiveOrders?: number | null;
  externalDeliveryActiveOrders?: number | null;
};

type BackendPaymentStats = {
  pendingValidationCount?: number | null;
};

function computeDelta(current: number, baseline: number) {
  if (!baseline) {
    return current > 0 ? 100 : 0;
  }

  return Number(((current / baseline) * 100).toFixed(1));
}

async function getOrderBadges(request: NextRequest) {
  const [dashboardResponse, paymentStatsResponse] = await Promise.all([
    fetchBackend(request, "/admin/dashboard"),
    fetchBackend(request, "/admin/payments/stats"),
  ]);
  await Promise.all([
    relayAuthFailure(dashboardResponse),
    relayAuthFailure(paymentStatsResponse),
  ]);

  if (!dashboardResponse.ok) {
    return getDeliveryOnlyBadges(request);
  }

  const payload = await parseBackendJson<BackendDashboard>(dashboardResponse);
  const paymentStatsPayload = paymentStatsResponse.ok
    ? await parseBackendJson<BackendPaymentStats>(paymentStatsResponse)
    : null;

  return {
    orders:
      Number(payload?.internalUnderReviewOrders ?? 0) +
      Number(payload?.internalPendingPaymentOrders ?? 0) +
      Number(payload?.externalOperationalOrders ?? 0),
    quotes:
      Number(payload?.externalCreatedOrders ?? 0) +
      Number(payload?.externalUnderReviewOrders ?? 0) +
      Number(payload?.externalQuotedOrders ?? 0),
    payments: Number(
      paymentStatsPayload?.pendingValidationCount ??
      payload?.internalPendingPaymentOrders ??
      0
    ),
    delivery:
      Number(payload?.internalDeliveryActiveOrders ?? 0) +
      Number(payload?.externalDeliveryActiveOrders ?? 0),
  };
}

async function getDeliveryOnlyBadges(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/delivery/active");
  await relayAuthFailure(response);

  if (!response.ok) {
    return {
      orders: 0,
      quotes: 0,
      payments: 0,
      delivery: 0,
    };
  }

  const payload = await parseBackendJson<unknown>(response);
  const content = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { content?: unknown[] }).content)
      ? (payload as { content: unknown[] }).content
      : [];

  return {
    orders: 0,
    quotes: 0,
    payments: 0,
    delivery: content.length,
  };
}

export async function GET(request: NextRequest) {
  const [dashboardResponse, badges] = await Promise.all([
    fetchBackend(request, "/admin/dashboard"),
    getOrderBadges(request),
  ]);
  await relayAuthFailure(dashboardResponse);

  if (!dashboardResponse.ok) {
    return NextResponse.json({
      metrics: [],
      badges,
    } satisfies TodayStatsResponse);
  }

  const payload = await parseBackendJson<BackendDashboard>(dashboardResponse);
  const todayOrders = Number(payload.todayOrders ?? 0);
  const paidOrdersToday = Number(payload.paidOrdersToday ?? 0);
  const todaySales = Number(payload.todaySales ?? 0);
  const todayMargin = Number(payload.todayEstimatedMargin ?? 0);

  const result: TodayStatsResponse = {
    metrics: [
      {
        id: "ordersToday",
        label: "Pedidos hoje",
        value: todayOrders,
        icon: "orders",
        delta: computeDelta(todayOrders, Number(payload.totalOrders ?? 0)),
      },
      {
        id: "paidOrders",
        label: "Pagamentos confirmados",
        value: paidOrdersToday,
        icon: "wallet",
        delta: computeDelta(paidOrdersToday, todayOrders),
      },
      {
        id: "todayRevenue",
        label: "Receita de hoje",
        value: todaySales,
        icon: "chart",
        delta: computeDelta(todaySales, Number(payload.weeklySales ?? 0)),
      },
      {
        id: "margin",
        label: "Margem estimada",
        value: todayMargin,
        icon: "shield",
        delta: computeDelta(todayMargin, todaySales),
      },
    ],
    badges,
  };

  return NextResponse.json(result);
}
