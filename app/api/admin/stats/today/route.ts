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

type WorkQueueSummary = {
  orders?: number | null;
  externalQuotes?: number | null;
  delivery?: number | null;
  customers?: number | null;
  orphanOrders?: number | null;
  prepareProductCount?: number | null;
  internalOrdersNeedingAction?: number | null;
  internalCodPrepareCount?: number | null;
};

type ManualPaymentQueueSummary = {
  pendingAttentionCount?: number | null;
  pendingReviewCount?: number | null;
  submitted?: number | null;
  submittedCount?: number | null;
  proofUploaded?: number | null;
  proofUploadedCount?: number | null;
  underReview?: number | null;
  underReviewCount?: number | null;
  suspicious?: number | null;
  suspiciousCount?: number | null;
};

function numberFrom(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getManualPaymentCount(payload: ManualPaymentQueueSummary | null) {
  const direct = numberFrom(payload?.pendingAttentionCount ?? payload?.pendingReviewCount);
  if (direct > 0) {
    return direct;
  }

  return (
    numberFrom(payload?.submitted) +
    numberFrom(payload?.submittedCount) +
    numberFrom(payload?.proofUploaded) +
    numberFrom(payload?.proofUploadedCount) +
    numberFrom(payload?.underReview) +
    numberFrom(payload?.underReviewCount) +
    numberFrom(payload?.suspicious) +
    numberFrom(payload?.suspiciousCount)
  );
}

function computeDelta(current: number, baseline: number) {
  if (!baseline) {
    return current > 0 ? 100 : 0;
  }

  return Number(((current / baseline) * 100).toFixed(1));
}

async function getManualPaymentBadge(request: NextRequest) {
  let response: Response;
  try {
    response = await fetchBackend(request, "/admin/payment-submissions/queues");
    await relayAuthFailure(response);
  } catch {
    return 0;
  }

  if (!response.ok) {
    return 0;
  }

  const payload = await parseBackendJson<ManualPaymentQueueSummary | null>(response);
  return getManualPaymentCount(payload);
}

async function getOrderBadges(request: NextRequest) {
  const [workQueueResponse, payments] = await Promise.all([
    fetchBackend(request, "/admin/work-queue/summary"),
    getManualPaymentBadge(request),
  ]);
  await relayAuthFailure(workQueueResponse);
  if (workQueueResponse.ok) {
    const queue = await parseBackendJson<WorkQueueSummary>(workQueueResponse);
    return {
      orders: Number(queue.orders ?? 0),
      quotes: Number(queue.externalQuotes ?? 0),
      payments,
      delivery: Number(queue.delivery ?? 0),
      orphanOrders: Number(queue.orphanOrders ?? 0),
      prepareProductCount: Number(queue.prepareProductCount ?? queue.orders ?? 0),
      internalOrdersNeedingAction: Number(queue.internalOrdersNeedingAction ?? queue.orders ?? 0),
      internalCodPrepareCount: Number(queue.internalCodPrepareCount ?? 0),
    };
  }

  const [dashboardResponse] = await Promise.all([
    fetchBackend(request, "/admin/dashboard"),
  ]);
  await relayAuthFailure(dashboardResponse);

  if (!dashboardResponse.ok) {
    return getDeliveryOnlyBadges(request);
  }

  const payload = await parseBackendJson<BackendDashboard>(dashboardResponse);
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
    payments,
    delivery: deliveryBadges.delivery,
    orphanOrders: 0,
    prepareProductCount: 0,
    internalOrdersNeedingAction: 0,
    internalCodPrepareCount: 0,
  };
}

async function getDeliveryOnlyBadges(request: NextRequest) {
  const [pendingResult, activeResult] = await Promise.all([
    fetchPendingDeliveryOrders(request),
    fetchActiveDeliveryOrders(request),
  ]);

  if ("error" in pendingResult || "error" in activeResult) {
    return { orders: 0, quotes: 0, payments: 0, delivery: 0, orphanOrders: 0, prepareProductCount: 0, internalOrdersNeedingAction: 0, internalCodPrepareCount: 0 };
  }

  const deliveryIds = new Set([
    ...pendingResult.map((order) => order.id),
    ...activeResult.map((order) => order.id),
  ]);

  return { orders: 0, quotes: 0, payments: 0, delivery: deliveryIds.size, orphanOrders: 0, prepareProductCount: 0, internalOrdersNeedingAction: 0, internalCodPrepareCount: 0 };
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
