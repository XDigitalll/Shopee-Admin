import { NextRequest } from "next/server";

import { fetchBackend, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import { fetchOrderDetailBundle } from "@/app/api/admin/orders/[id]/_shared";
import { getQuoteDraft } from "@/lib/admin/quote-drafts";
import type {
  AdminQuoteDetail,
  AdminQuoteListItem,
  AdminQuoteStatsResponse,
  AdminQuoteStatus,
  AdminQuotesFilterState,
} from "@/lib/admin/types";

type BackendPage<T> = {
  content?: T[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
};

type BackendOrder = {
  id: number;
  code?: string | null;
  orderCode?: string | null;
  customerEmail?: string;
  customerFullName?: string;
  primaryPhoneNumber?: string;
  type?: "EXTERNAL" | "INTERNAL";
  urgent?: boolean | null;
  totalAmount?: number;
  status?: string;
  orderDate?: string;
  externalCartUrl?: string | null;
  sourceStore?: string | null;
  activeQuote?: {
    quotedAt?: string | null;
    finalAmountMzn?: number | null;
  } | null;
};

function getOrderNumber(order: Pick<BackendOrder, "id" | "code" | "orderCode">) {
  return order.code || order.orderCode || `#${order.id}`;
}

const STORE_LABELS: Record<string, string> = {
  SHEIN: "Shein",
  TEMU: "Temu",
  AMAZON: "Amazon",
  ALI_EXPRESS: "AliExpress",
  ZARA: "Zara",
  ASOS: "ASOS",
  EBAY: "eBay",
};

function getStoreLabel(store: string | null | undefined) {
  if (!store) {
    return "Loja externa";
  }

  return STORE_LABELS[store] ?? store.replaceAll("_", " ");
}

function getCustomerInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "CL"
  );
}

function formatTimeAgo(value: string) {
  const createdAt = new Date(value).getTime();
  const diffHours = Math.max(0, (Date.now() - createdAt) / 36e5);

  if (diffHours < 1) {
    const minutes = Math.max(1, Math.round(diffHours * 60));
    return `há ${minutes} min`;
  }

  if (diffHours < 24) {
    return `há ${Math.floor(diffHours)} h`;
  }

  const days = Math.floor(diffHours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}

function normalizeQuoteStatus(order: BackendOrder, hasDraft: boolean): AdminQuoteStatus {
  const status = String(order.status ?? "UNDER_REVIEW");

  if (status === "CANCELLED" || status === "FAILED") {
    return "REJECTED";
  }

  if (status === "QUOTED") {
    return "SENT";
  }

  if (
    [
      "APPROVED",
      "PENDING_PAYMENT",
      "PAID",
      "ORDERED",
      "IN_TRANSIT",
      "ARRIVED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ].includes(status)
  ) {
    return "APPROVED";
  }

  if (hasDraft) {
    return "DRAFT";
  }

  return "UNDER_REVIEW";
}

function needsAnalysisAttention(createdAt: string, status: AdminQuoteStatus) {
  return ["UNDER_REVIEW", "DRAFT"].includes(status)
    && Date.now() - new Date(createdAt).getTime() >= 4 * 60 * 60 * 1000;
}

function estimateValidityDate(quotedAt: string | null | undefined) {
  if (!quotedAt) {
    return null;
  }

  const date = new Date(quotedAt);
  date.setDate(date.getDate() + 7);
  return date.toISOString();
}

function extractSummaryItems(externalCartUrl: string | null | undefined) {
  const summary = externalCartUrl?.trim();
  if (!summary || /^https?:\/\//i.test(summary)) {
    return [];
  }

  return summary
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/\s*x\d+\s*$/i, "").trim())
    .filter(Boolean);
}

async function fetchExternalOrders(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/orders?page=0&size=250");
  await relayAuthFailure(response);

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  const payload = await parseBackendJson<BackendPage<BackendOrder>>(response);
  return (payload?.content ?? []).filter((order) => order.type === "EXTERNAL");
}

function buildQuoteCardBase(order: BackendOrder) {
  const hasDraft = Boolean(getQuoteDraft(String(order.id)));
  const status = normalizeQuoteStatus(order, hasDraft);
  const createdAt = order.orderDate ?? new Date().toISOString();
  const itemNames = extractSummaryItems(order.externalCartUrl);
  return {
    id: order.id,
    orderNumber: getOrderNumber(order),
    customerName: order.customerFullName || order.customerEmail || "Cliente externo",
    customerInitials: getCustomerInitials(order.customerFullName || order.customerEmail || "Cliente"),
    sourceStore: order.sourceStore || "EXTERNAL",
    storeLabel: getStoreLabel(order.sourceStore),
    status,
    createdAt,
    timeAgoLabel: formatTimeAgo(createdAt),
    estimatedValue: Number(order.activeQuote?.finalAmountMzn ?? order.totalAmount ?? 0),
    externalCartUrl: order.externalCartUrl ?? null,
    itemChips: itemNames.slice(0, 3),
    remainingItems: Math.max(itemNames.length - 3, 0),
    itemsCount: itemNames.length,
    urgent: needsAnalysisAttention(createdAt, status),
    quoteSentAt: order.activeQuote?.quotedAt ?? null,
    validityDate: estimateValidityDate(order.activeQuote?.quotedAt ?? null),
  } satisfies AdminQuoteListItem;
}

function filterQuotes(items: AdminQuoteListItem[], filters: AdminQuotesFilterState) {
  let filtered = [...items];

  if (filters.status !== "ALL") {
    filtered = filtered.filter((item) => item.status === filters.status);
  }

  if (filters.store !== "ALL") {
    filtered = filtered.filter((item) => item.sourceStore === filters.store);
  }

  const search = filters.search.trim().toLowerCase();
  if (search) {
    filtered = filtered.filter((item) =>
      [
        item.orderNumber.toLowerCase(),
        item.customerName.toLowerCase(),
        item.storeLabel.toLowerCase(),
        String(item.id),
      ].some((value) => value.includes(search))
    );
  }

  filtered.sort((left, right) => {
    if (filters.sort === "VALUE") {
      return right.estimatedValue - left.estimatedValue;
    }

    if (filters.sort === "URGENT") {
      if (left.urgent !== right.urgent) {
        return left.urgent ? -1 : 1;
      }

      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return filtered;
}

export async function getQuotesPage(request: NextRequest, filters: AdminQuotesFilterState) {
  const orders = await fetchExternalOrders(request);
  const cards = orders.map(buildQuoteCardBase);
  const filtered = filterQuotes(cards, filters);
  const start = filters.page * filters.size;
  const content = filtered.slice(start, start + filters.size);

  return {
    content,
    page: filters.page,
    size: filters.size,
    totalElements: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / filters.size)),
  };
}

export async function getQuoteStats(request: NextRequest): Promise<AdminQuoteStatsResponse> {
  const orders = await fetchExternalOrders(request);
  const statuses = orders.map((order) => normalizeQuoteStatus(order, Boolean(getQuoteDraft(String(order.id)))));

  return {
    all: statuses.length,
    underReview: statuses.filter((status) => status === "UNDER_REVIEW").length,
    draft: statuses.filter((status) => status === "DRAFT").length,
    sent: statuses.filter((status) => status === "SENT").length,
    approved: statuses.filter((status) => status === "APPROVED").length,
    rejected: statuses.filter((status) => status === "REJECTED").length,
    pendingAnalysis: statuses.filter((status) => status === "UNDER_REVIEW").length,
  };
}

export async function getQuoteDetail(request: NextRequest, id: string) {
  const detailBundle = await fetchOrderDetailBundle(request, id);

  if ("error" in detailBundle) {
    return detailBundle;
  }

  const detail = detailBundle.detail;
  const hasDraft = Boolean(getQuoteDraft(id));
  const status = normalizeQuoteStatus(
    {
      id: detail.id,
      customerEmail: detail.customerEmail,
      customerFullName: detail.customerName,
      primaryPhoneNumber: detail.customerPhone,
      type: detail.type,
      totalAmount: detail.totalAmount,
      status: detail.status,
      orderDate: detail.createdAt,
      externalCartUrl: detail.externalCartUrl,
      sourceStore: detail.sourceStore,
      activeQuote: detail.latestQuoteSentAt
        ? {
            quotedAt: detail.latestQuoteSentAt,
            finalAmountMzn: detail.totalAmount,
          }
        : null,
    },
    hasDraft
  );

  const response: AdminQuoteDetail = {
    id: detail.id,
    orderNumber: detail.number,
    status,
    sourceStore: detail.sourceStore,
    storeLabel: getStoreLabel(detail.sourceStore),
    createdAt: detail.createdAt,
    validityDate: estimateValidityDate(detail.latestQuoteSentAt),
    externalCartUrl: detail.externalCartUrl,
    estimatedValue: detail.totalAmount,
    customerName: detail.customerName,
    customerEmail: detail.customerEmail,
    customerPhone: detail.customerPhone,
    urgent: needsAnalysisAttention(detail.createdAt, status),
    items: detail.externalItems.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      amount: detail.quoteExchangeRate && item.originalPriceUsd > 0
        ? Math.round(item.originalPriceUsd * detail.quoteExchangeRate * 100) / 100
        : item.originalPriceUsd || 0,
    })),
    financialSummary: {
      items: detail.itemSubtotal,
      freightAndTaxes:
        Number(detail.additionalCosts.freight ?? 0) +
        Number(detail.additionalCosts.customs ?? 0),
      commission: Number(detail.additionalCosts.commission ?? 0),
      total: detail.totalAmount,
    },
    rejectReason:
      status === "REJECTED" ? "Pedido recusado ou cancelado antes do envio da cotação." : null,
  };

  return { detail: response };
}
