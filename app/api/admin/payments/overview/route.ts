import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import type {
  AdminPaymentListItem,
  AdminPaymentsPageResponse,
  AdminPaymentStatsResponse,
} from "@/lib/admin/types";

type BackendPage<T> = {
  content?: T[];
  number?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
};

type BackendTransaction = {
  id?: number;
  orderId?: number;
  orderNumber?: string;
  customerName?: string;
  method?: string;
  amount?: number;
  providerFee?: number | null;
  providerNetAmount?: number | null;
  providerFeePercentage?: number | null;
  providerTransactionType?: string | null;
  status?: string;
  date?: string | null;
  transactionId?: string | null;
};

type BackendOrder = {
  id?: number;
  customerEmail?: string | null;
  customerFullName?: string | null;
  primaryPhoneNumber?: string | null;
  totalAmount?: number;
  orderDate?: string | null;
  paymentDate?: string | null;
  payment?: {
    id?: number | null;
    amount?: number;
    method?: string | null;
    provider?: string | null;
    providerReference?: string | null;
    providerStatus?: string | null;
    checkoutUrl?: string | null;
    expectedAmount?: number | null;
    providerFee?: number | null;
    providerNetAmount?: number | null;
    providerFeePercentage?: number | null;
    providerTransactionType?: string | null;
    status?: string | null;
    transactionId?: string | null;
    payerName?: string | null;
    payerPhone?: string | null;
    notes?: string | null;
    adminNote?: string | null;
    paymentDate?: string | null;
    submittedAt?: string | null;
    reviewedAt?: string | null;
  } | null;
};

function mapItem(item: Partial<AdminPaymentListItem>): AdminPaymentListItem {
  return {
    id: Number(item.id ?? 0),
    status: String(item.status ?? "PENDING") as AdminPaymentListItem["status"],
    receiptSubmitted: Boolean(item.receiptSubmitted ?? false),
    orderId: Number(item.orderId ?? 0),
    orderNumber: String(item.orderNumber ?? ""),
    customerId: item.customerId == null ? null : Number(item.customerId),
    customerName: String(item.customerName ?? "Cliente"),
    customerEmail: item.customerEmail ?? null,
    customerPhone: item.customerPhone ?? null,
    method: item.method ?? null,
    provider: item.provider ?? null,
    providerReference: item.providerReference ?? null,
    providerStatus: item.providerStatus ?? null,
    checkoutUrl: item.checkoutUrl ?? null,
    expectedAmount: item.expectedAmount == null ? null : Number(item.expectedAmount),
    providerFee: item.providerFee == null ? null : Number(item.providerFee),
    providerNetAmount: item.providerNetAmount == null ? null : Number(item.providerNetAmount),
    providerFeePercentage: item.providerFeePercentage == null ? null : Number(item.providerFeePercentage),
    providerTransactionType: item.providerTransactionType ?? null,
    amount: Number(item.amount ?? 0),
    submittedAt: item.submittedAt ?? null,
    reviewedAt: item.reviewedAt ?? null,
    paymentDate: item.paymentDate ?? null,
    transactionId: item.transactionId ?? null,
    payerName: item.payerName ?? null,
    payerPhone: item.payerPhone ?? null,
    notes: item.notes ?? null,
    adminNote: item.adminNote ?? null,
    orderItems: item.orderItems ?? [],
  };
}

function normalizePrimaryPage(
  payload: BackendPage<Partial<AdminPaymentListItem>> | Array<Partial<AdminPaymentListItem>> | null,
  fallbackPage: number,
  fallbackSize: number,
): AdminPaymentsPageResponse {
  if (Array.isArray(payload)) {
    const content = payload.map(mapItem);
    return {
      content,
      page: fallbackPage,
      size: fallbackSize,
      totalElements: content.length,
      totalPages: Math.max(1, Math.ceil(content.length / Math.max(fallbackSize, 1))),
    };
  }

  return {
    content: (payload?.content ?? []).map(mapItem),
    page: Number(payload?.number ?? fallbackPage),
    size: Number(payload?.size ?? fallbackSize),
    totalElements: Number(payload?.totalElements ?? 0),
    totalPages: Number(payload?.totalPages ?? 0),
  };
}

function mapTransactionStatus(status: string | undefined): AdminPaymentListItem["status"] {
  switch ((status ?? "").toUpperCase()) {
    case "SUCCESS":
    case "APPROVED":
    case "VALIDATED":
    case "PAID":
      return "VALIDATED";
    case "FAILED":
    case "CANCELLED":
    case "REJECTED":
    case "REFUNDED":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

function resolveTransactionsPeriod(period: string | null) {
  switch ((period ?? "ALL").toUpperCase()) {
    case "TODAY":
    case "7D":
      return "week";
    case "30D":
      return "month";
    default:
      return "year";
  }
}

function mapTransactionItem(item: BackendTransaction): AdminPaymentListItem {
  return {
    id: Number(item.id ?? 0),
    status: mapTransactionStatus(item.status),
    receiptSubmitted: (item.method ?? "") !== "CASH_ON_DELIVERY",
    orderId: Number(item.orderId ?? 0),
    orderNumber: String(item.orderNumber ?? ""),
    customerId: null,
    customerName: String(item.customerName ?? "Cliente"),
    customerEmail: null,
    customerPhone: null,
    method: item.method ?? null,
    provider: "PAYSUITE",
    providerFee: item.providerFee == null ? null : Number(item.providerFee),
    providerNetAmount: item.providerNetAmount == null ? null : Number(item.providerNetAmount),
    providerFeePercentage: item.providerFeePercentage == null ? null : Number(item.providerFeePercentage),
    providerTransactionType: item.providerTransactionType ?? null,
    amount: Number(item.amount ?? 0),
    submittedAt: item.date ?? null,
    reviewedAt: null,
    paymentDate: item.date ?? null,
    transactionId: item.transactionId ?? null,
    payerName: null,
    payerPhone: null,
    notes: null,
    adminNote: null,
    orderItems: [],
  };
}

function normalizeTransactionsPage(
  payload: BackendTransaction[] | BackendPage<BackendTransaction> | null,
  url: URL,
  fallbackSize: number,
): AdminPaymentsPageResponse {
  const fallbackPage = Number(url.searchParams.get("page") ?? 0);
  const requestedSize = Number(url.searchParams.get("size") ?? fallbackSize);
  const items = Array.isArray(payload) ? payload : payload?.content ?? [];
  const filtered = items
    .map(mapTransactionItem)
    .filter((item) => matchesStatus(item, url.searchParams.get("status")))
    .filter((item) => matchesMethod(item, url.searchParams.get("method")))
    .filter((item) => matchesSearch(item, url.searchParams.get("search")))
    .filter((item) => matchesPeriod(item, url.searchParams.get("period")))
    .sort((left, right) => {
      const leftTime = new Date(left.submittedAt ?? left.paymentDate ?? left.reviewedAt ?? 0).getTime();
      const rightTime = new Date(right.submittedAt ?? right.paymentDate ?? right.reviewedAt ?? 0).getTime();
      return rightTime - leftTime;
    });

  const start = fallbackPage * requestedSize;
  const content = filtered.slice(start, start + requestedSize);

  return {
    content,
    page: fallbackPage,
    size: requestedSize,
    totalElements: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / Math.max(requestedSize, 1))),
  };
}

function mapPaymentStatus(status: string | null | undefined): AdminPaymentListItem["status"] {
  switch ((status ?? "").toUpperCase()) {
    case "SUCCESS":
    case "APPROVED":
    case "VALIDATED":
    case "PAID":
      return "VALIDATED";
    case "FAILED":
    case "CANCELLED":
    case "REJECTED":
    case "REFUNDED":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

function mapOrderPaymentItem(order: BackendOrder): AdminPaymentListItem | null {
  const payment = order.payment;
  if (!payment) {
    return null;
  }

  return {
    id: Number(payment.id ?? order.id ?? 0),
    status: mapPaymentStatus(payment.status),
    receiptSubmitted: Boolean(payment.submittedAt),
    orderId: Number(order.id ?? 0),
    orderNumber: `PED-${String(order.id ?? 0).padStart(5, "0")}`,
    customerId: null,
    customerName: String(payment.payerName ?? order.customerFullName ?? order.customerEmail ?? "Cliente"),
    customerEmail: order.customerEmail ?? null,
    customerPhone: payment.payerPhone ?? order.primaryPhoneNumber ?? null,
    method: payment.method ?? null,
    provider: payment.provider ?? null,
    providerReference: payment.providerReference ?? null,
    providerStatus: payment.providerStatus ?? null,
    checkoutUrl: payment.checkoutUrl ?? null,
    expectedAmount: payment.expectedAmount == null ? null : Number(payment.expectedAmount),
    providerFee: payment.providerFee == null ? null : Number(payment.providerFee),
    providerNetAmount: payment.providerNetAmount == null ? null : Number(payment.providerNetAmount),
    providerFeePercentage: payment.providerFeePercentage == null ? null : Number(payment.providerFeePercentage),
    providerTransactionType: payment.providerTransactionType ?? null,
    amount: Number(payment.amount ?? order.totalAmount ?? 0),
    submittedAt: payment.submittedAt ?? null,
    reviewedAt: payment.reviewedAt ?? null,
    paymentDate: payment.paymentDate ?? order.paymentDate ?? null,
    transactionId: payment.transactionId ?? null,
    payerName: payment.payerName ?? null,
    payerPhone: payment.payerPhone ?? null,
    notes: payment.notes ?? null,
    adminNote: payment.adminNote ?? null,
    orderItems: [],
  };
}

function matchesSearch(item: AdminPaymentListItem, search: string | null) {
  const normalized = search?.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    String(item.id),
    String(item.orderId),
    item.orderNumber,
    item.customerName,
    item.customerEmail ?? "",
    item.customerPhone ?? "",
    item.payerName ?? "",
    item.transactionId ?? "",
  ].some((value) => value.toLowerCase().includes(normalized));
}

function matchesMethod(item: AdminPaymentListItem, method: string | null) {
  if (!method || method === "ALL") {
    return true;
  }

  return (item.method ?? "").toUpperCase() === method.toUpperCase();
}

function matchesStatus(item: AdminPaymentListItem, status: string | null) {
  if (!status || status === "ALL") {
    return true;
  }

  return item.status === status;
}

function matchesPeriod(item: AdminPaymentListItem, period: string | null) {
  if (!period || period === "ALL") {
    return true;
  }

  const reference = item.submittedAt ?? item.paymentDate ?? item.reviewedAt;
  if (!reference) {
    return false;
  }

  const date = new Date(reference);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "TODAY") {
    return date >= startToday;
  }

  if (period === "7D") {
    const weekAgo = new Date(startToday);
    weekAgo.setDate(weekAgo.getDate() - 6);
    return date >= weekAgo;
  }

  if (period === "30D") {
    const monthAgo = new Date(startToday);
    monthAgo.setDate(monthAgo.getDate() - 29);
    return date >= monthAgo;
  }

  return true;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams();
  const requestedPage = Number(url.searchParams.get("page") ?? 0);
  const requestedSize = Number(url.searchParams.get("size") ?? 10);

  for (const key of ["status", "method", "period", "search", "page", "size"]) {
    const value = url.searchParams.get(key);
    if (value) {
      searchParams.set(key, value);
    }
  }

  const [statsResponse, listResponse] = await Promise.all([
    fetchBackend(request, "/admin/payments/stats"),
    fetchBackend(request, `/admin/payments?${searchParams.toString()}`),
  ]);

  await Promise.all([
    relayAuthFailure(statsResponse),
    relayAuthFailure(listResponse),
  ]);

  if (!statsResponse.ok && !listResponse.ok) {
    return jsonError("Não foi possível carregar os pagamentos.", listResponse.status || statsResponse.status);
  }

  const statsPayload = statsResponse.ok
    ? await parseBackendJson<AdminPaymentStatsResponse>(statsResponse)
    : null;
  const listPayload = listResponse.ok
    ? await parseBackendJson<
        BackendPage<Partial<AdminPaymentListItem>> | Array<Partial<AdminPaymentListItem>>
      >(listResponse)
    : null;

  const primaryPage = normalizePrimaryPage(listPayload, requestedPage, requestedSize);

  let page = primaryPage;
  const shouldUseTransactionsFallback =
    (!listResponse.ok || primaryPage.content.length === 0) &&
    Number(statsPayload?.all ?? 0) > 0;

  if (shouldUseTransactionsFallback) {
    const fallbackPeriod = resolveTransactionsPeriod(url.searchParams.get("period"));
    const transactionsResponse = await fetchBackend(
      request,
      `/admin/finance/transactions?period=${fallbackPeriod}&page=${requestedPage}`,
    );
    await relayAuthFailure(transactionsResponse);

    if (transactionsResponse.ok) {
      const transactions = await parseBackendJson<
        BackendTransaction[] | BackendPage<BackendTransaction>
      >(transactionsResponse);
      page = normalizeTransactionsPage(transactions, url, primaryPage.size);
    }
  }

  const shouldUseOrdersFallback =
    page.content.length === 0 &&
    Number(statsPayload?.all ?? 0) > 0;

  if (shouldUseOrdersFallback) {
    const ordersResponse = await fetchBackend(request, "/admin/orders?page=0&size=250");
    await relayAuthFailure(ordersResponse);

    if (ordersResponse.ok) {
      const ordersPayload =
        await parseBackendJson<BackendPage<BackendOrder>>(ordersResponse);
      const filtered = (ordersPayload?.content ?? [])
        .map(mapOrderPaymentItem)
        .filter((item): item is AdminPaymentListItem => Boolean(item))
        .filter((item) => matchesStatus(item, url.searchParams.get("status")))
        .filter((item) => matchesMethod(item, url.searchParams.get("method")))
        .filter((item) => matchesSearch(item, url.searchParams.get("search")))
        .filter((item) => matchesPeriod(item, url.searchParams.get("period")))
        .sort((left, right) => {
          const leftTime = new Date(left.submittedAt ?? left.paymentDate ?? left.reviewedAt ?? 0).getTime();
          const rightTime = new Date(right.submittedAt ?? right.paymentDate ?? right.reviewedAt ?? 0).getTime();
          return rightTime - leftTime;
        });

      const start = requestedPage * requestedSize;
      const content = filtered.slice(start, start + requestedSize);

      page = {
        content,
        page: requestedPage,
        size: requestedSize,
        totalElements: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / Math.max(requestedSize, 1))),
      };
    }
  }

  const result: { stats: AdminPaymentStatsResponse; page: AdminPaymentsPageResponse } = {
    stats: {
      all: Number(statsPayload?.all ?? 0),
      pending: Number(statsPayload?.pending ?? 0),
      validated: Number(statsPayload?.validated ?? 0),
      rejected: Number(statsPayload?.rejected ?? 0),
      pendingValidationCount: Number(statsPayload?.pendingValidationCount ?? 0),
      validatedTodayAmount: Number(statsPayload?.validatedTodayAmount ?? 0),
    },
    page,
  };

  return NextResponse.json(result);
}
