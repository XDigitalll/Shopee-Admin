import { NextRequest, NextResponse } from "next/server";

import { fetchActiveDeliveryOrders, fetchPendingDeliveryOrders } from "@/app/api/admin/delivery/_shared";
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

type BackendPaymentSubmissionStats = {
  submitted?: number | null;
  underReview?: number | null;
  suspicious?: number | null;
  requestNewProof?: number | null;
};

function computeDelta(current: number, baseline: number) {
  if (!baseline) {
    return current > 0 ? 100 : 0;
  }

  return Number(((current / baseline) * 100).toFixed(1));
}

async function getOrderBadges(request: NextRequest) {
  const [dashboardResponse, paymentStatsResponse, paymentQueueResponse] = await Promise.all([
    fetchBackend(request, "/admin/dashboard"),
    fetchBackend(request, "/admin/payments/stats"),
    fetchBackend(request, "/admin/payment-submissions/queues"),
  ]);
  await Promise.all([
    relayAuthFailure(dashboardResponse),
    relayAuthFailure(paymentStatsResponse),
    relayAuthFailure(paymentQueueResponse),
  ]);

  if (!dashboardResponse.ok) {
    return getDeliveryOnlyBadges(request);
  }

  const payload = await parseBackendJson<BackendDashboard>(dashboardResponse);
  const paymentStatsPayload = paymentStatsResponse.ok
    ? await parseBackendJson<BackendPaymentStats>(paymentStatsResponse)
    : null;
  const paymentQueuePayload = paymentQueueResponse.ok
    ? await parseBackendJson<BackendPaymentSubmissionStats>(paymentQueueResponse)
    : null;
  const paymentQueueCount =
    Number(paymentQueuePayload?.submitted ?? 0) +
    Number(paymentQueuePayload?.underReview ?? 0) +
    Number(paymentQueuePayload?.suspicious ?? 0);

  const deliveryBadges = await getDeliveryOnlyBadges(request);

  return {
    orders:
      Number(payload?.internalUnderReviewOrders ?? 0) +
      Number(payload?.internalPendingPaymentOrders ?? 0) +
      Number(payload?.externalOperationalOrders ?? 0),
    quotes:
      Number(payload?.externalCreatedOrders ?? 0) +
      Number(payload?.externalUnderReviewOrders ?? 0) +
      Number(payload?.externalQuotedOrders ?? 0),
    payments: paymentQueueCount || Number(
      paymentStatsPayload?.pendingValidationCount ??
      payload?.internalPendingPaymentOrders ??
      0
    ),
    delivery: deliveryBadges.delivery,
  };
}

async function getDeliveryOnlyBadges(request: NextRequest) {
  const [pendingResult, activeResult] = await Promise.all([
    fetchPendingDeliveryOrders(request),
    fetchActiveDeliveryOrders(request),
  ]);

  if ("error" in pendingResult || "error" in activeResult) {
    return {
      orders: 0,
      quotes: 0,
      payments: 0,
      delivery: 0,
    };
  }

  const deliveryIds = new Set([
    ...pendingResult.map((order) => order.id),
    ...activeResult.map((order) => order.id),
  ]);

  return {
    orders: 0,
    quotes: 0,
    payments: 0,
    delivery: deliveryIds.size,
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
