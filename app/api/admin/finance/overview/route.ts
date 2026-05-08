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

type BackendKPIs = {
  averageTicket?: number;
  cancellationRate?: number;
  externalRevenueShare?: number;
  pendingPaymentsCount?: number;
};

type BackendChartItem = {
  date?: string;
  revenue?: number;
  commission?: number;
  orders?: number;
};

type BackendTransaction = {
  id?: number;
  orderNumber?: string;
  customerName?: string;
  method?: string;
  amount?: number;
  status?: string;
};

type BackendClient = {
  userId?: number;
  name?: string;
  email?: string;
  totalSpent?: number;
  orderCount?: number;
};

type BackendMethod = {
  method?: string;
  amount?: number;
  percentage?: number;
  count?: number;
};

type BackendCostBreakdown = {
  totalSiteTax?: number;
  totalExternalCommission?: number;
  totalInsurance?: number;
  totalCustoms?: number;
  totalOperationalCost?: number;
};

const TODAY = new Date().toISOString().slice(0, 10);

const METHOD_LABELS: Record<string, string> = {
  MPESA: "M-Pesa",
  EMOLA: "e-Mola",
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  PAYPAL: "PayPal",
  BANK_TRANSFER: "Transferência",
  CASH_ON_DELIVERY: "Entrega",
};

function formatLabel(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short" }).format(
      new Date(dateStr + "T00:00:00")
    );
  } catch {
    return dateStr;
  }
}

function normalizeStatus(s: string | undefined): "PAID" | "PENDING" | "REFUNDED" {
  if (s === "APPROVED") return "PAID";
  if (s === "REFUNDED") return "REFUNDED";
  return "PENDING";
}

export async function GET(request: NextRequest) {
  const period = new URL(request.url).searchParams.get("period") ?? "month";

  const [
    statsRes,
    chartRes,
    transactionsRes,
    kpisRes,
    topClientsRes,
    paymentMethodsRes,
    costBreakdownRes,
    dashboardRes,
  ] = await Promise.all([
    fetchBackend(request, `/admin/finance/stats?period=${period}`),
    fetchBackend(request, `/admin/finance/chart?period=${period}`),
    fetchBackend(request, `/admin/finance/transactions?period=${period}&page=0`),
    fetchBackend(request, "/admin/finance/kpis"),
    fetchBackend(request, "/admin/finance/top-clients"),
    fetchBackend(request, "/admin/finance/payment-methods"),
    fetchBackend(request, "/admin/finance/cost-breakdown"),
    fetchBackend(request, "/admin/dashboard"),
  ]);

  await Promise.all([
    relayAuthFailure(statsRes),
    relayAuthFailure(chartRes),
    relayAuthFailure(transactionsRes),
    relayAuthFailure(kpisRes),
    relayAuthFailure(topClientsRes),
    relayAuthFailure(paymentMethodsRes),
    relayAuthFailure(costBreakdownRes),
    relayAuthFailure(dashboardRes),
  ]);

  if (
    !statsRes.ok &&
    !chartRes.ok &&
    !transactionsRes.ok &&
    !kpisRes.ok &&
    !topClientsRes.ok &&
    !paymentMethodsRes.ok &&
    !costBreakdownRes.ok &&
    !dashboardRes.ok
  ) {
    return jsonError("Não foi possível carregar os dados financeiros.", statsRes.status || 500);
  }

  const stats = statsRes.ok ? ((await parseBackendJson<BackendStats>(statsRes)) ?? {}) : {};
  const chart = chartRes.ok ? ((await parseBackendJson<BackendChartItem[]>(chartRes)) ?? []) : [];
  const transactions = transactionsRes.ok
    ? ((await parseBackendJson<BackendTransaction[]>(transactionsRes)) ?? [])
    : [];
  const kpis = kpisRes.ok ? ((await parseBackendJson<BackendKPIs>(kpisRes)) ?? {}) : {};
  const topClients = topClientsRes.ok ? ((await parseBackendJson<BackendClient[]>(topClientsRes)) ?? []) : [];
  const paymentMethods = paymentMethodsRes.ok
    ? ((await parseBackendJson<BackendMethod[]>(paymentMethodsRes)) ?? [])
    : [];
  const costBreakdown = costBreakdownRes.ok
    ? ((await parseBackendJson<BackendCostBreakdown>(costBreakdownRes)) ?? {})
    : {};
  const dashboard = dashboardRes.ok ? ((await parseBackendJson<BackendDashboard>(dashboardRes)) ?? {}) : {};

  const totalRevenue = Number(stats.totalRevenue ?? dashboard.totalSales ?? 0);
  const todayRevenue = Number(stats.todayRevenue ?? dashboard.todaySales ?? 0);
  const growth = Number(stats.revenueGrowth ?? 0);
  const commission = Number(stats.totalCommission ?? dashboard.totalSiteRevenue ?? 0);
  const todayCommission = Number(stats.todayCommission ?? dashboard.todaySiteRevenue ?? 0);
  const commissionDelta = commission > 0 ? (todayCommission / commission) * 100 : 0;
  const totalDelivery = Number(dashboard.totalDeliveryRevenue ?? stats.totalDelivery ?? 0);
  const todayDelivery = Number(dashboard.todayDeliveryRevenue ?? stats.todayDelivery ?? 0);
  const totalMerchandise = Number(
    dashboard.totalMerchandiseValue ?? totalRevenue - commission - totalDelivery
  );
  const todayMerchandise = Number(
    dashboard.todayMerchandiseValue ?? todayRevenue - todayCommission - todayDelivery
  );
  const totalMargin = Number(dashboard.totalEstimatedMargin ?? commission + totalDelivery);
  const todayMargin = Number(dashboard.todayEstimatedMargin ?? todayCommission + todayDelivery);
  const siteSharePct = Number(
    dashboard.siteRevenueSharePercentage ?? (totalRevenue > 0 ? (commission / totalRevenue) * 100 : 0)
  );
  const todaySiteSharePct = Number(
    dashboard.todaySiteRevenueSharePercentage ?? (todayRevenue > 0 ? (todayCommission / todayRevenue) * 100 : 0)
  );

  return NextResponse.json({
    stats: {
      totalRevenue,
      todayRevenue,
      totalRevenueDelta: Number(growth.toFixed(2)),
      commissionsEarned: commission,
      commissionsEarnedDelta: Number(commissionDelta.toFixed(2)),
      paidOrders: Number(stats.totalOrders ?? 0),
      paidOrdersDelta: Number(stats.todayOrders ?? 0),
      avgTicket: Number(kpis.averageTicket ?? dashboard.averageTicket ?? 0),
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
      paidOrdersToday: Number(dashboard.paidOrdersToday ?? stats.todayOrders ?? 0),
      internalSales: Number(dashboard.internalSales ?? 0),
      externalSales: Number(dashboard.externalSales ?? 0),
      internalSalesToday: Number(dashboard.internalSalesToday ?? 0),
      externalSalesToday: Number(dashboard.externalSalesToday ?? 0),
      paidInternalOrders: Number(dashboard.paidInternalOrders ?? 0),
      paidExternalOrders: Number(dashboard.paidExternalOrders ?? 0),
    },
    chart: chart.map((item) => ({
      date: item.date ?? "",
      label: formatLabel(item.date ?? ""),
      revenue: Number(item.revenue ?? 0),
      commission: Number(item.commission ?? 0),
      isToday: item.date === TODAY,
    })),
    transactions: transactions.slice(0, 10).map((tx) => ({
      id: String(tx.id ?? crypto.randomUUID()),
      orderNumber: tx.orderNumber ?? "",
      customer: tx.customerName ?? "",
      totalAmount: Number(tx.amount ?? 0),
      commission: 0,
      paymentMethod: METHOD_LABELS[tx.method ?? ""] ?? (tx.method ?? ""),
      status: normalizeStatus(tx.status),
    })),
    kpis: {
      avgMargin: Number(kpis.externalRevenueShare ?? 0),
      avgMarginTrend:
        Number(kpis.externalRevenueShare ?? 0) > 30
          ? "up"
          : Number(kpis.externalRevenueShare ?? 0) > 10
            ? "neutral"
            : "down",
      conversionRate: 100 - Number(kpis.cancellationRate ?? 0),
      conversionRateTrend:
        Number(kpis.cancellationRate ?? 0) < 5
          ? "up"
          : Number(kpis.cancellationRate ?? 0) < 15
            ? "neutral"
            : "down",
      avgQuoteTime: 0,
      avgQuoteTimeTrend: "neutral",
      cancelledOrders: Number(kpis.pendingPaymentsCount ?? 0),
      cancelledOrdersTrend: "neutral",
    },
    topClients: topClients.slice(0, 4).map((client, index) => ({
      rank: index + 1,
      name: client.name ?? client.email ?? "Cliente",
      orderCount: Number(client.orderCount ?? 0),
      totalSpent: Number(client.totalSpent ?? 0),
    })),
    methods: paymentMethods.map((method) => ({
      method: METHOD_LABELS[method.method ?? ""] ?? (method.method ?? ""),
      amount: Number(method.amount ?? 0),
      percentage: Number(method.percentage ?? 0),
    })),
    revenueByType: {
      external: Number(dashboard.externalSales ?? stats.totalRevenue ?? 0),
      internal: Number(dashboard.internalSales ?? 0),
      commissions: Number(stats.totalCommission ?? dashboard.totalSiteRevenue ?? 0),
    },
    costBreakdown: {
      siteTax: Number(costBreakdown.totalSiteTax ?? 0),
      externalCommission: Number(costBreakdown.totalExternalCommission ?? 0),
      insurance: Number(costBreakdown.totalInsurance ?? 0),
      customs: Number(costBreakdown.totalCustoms ?? 0),
      operational: Number(costBreakdown.totalOperationalCost ?? 0),
    },
  });
}
