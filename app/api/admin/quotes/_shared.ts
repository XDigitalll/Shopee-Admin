import { NextRequest } from "next/server";

import { fetchBackend, parseBackendJson, relayAuthFailure } from "@/app/api/admin/_utils";
import { fetchOrderDetailBundle } from "@/app/api/admin/orders/[id]/_shared";
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
  operationalStatus?: string | null;
  quoteQueueStatus?: AdminQuoteListItem["quoteQueueStatus"] | null;
  nextActionLabel?: string | null;
  nextActionModule?: string | null;
  isArchived?: boolean | null;
  orderDate?: string;
  externalCartUrl?: string | null;
  sourceStore?: string | null;
  needsClarification?: boolean | null;
  activeClarificationRequest?: {
    id?: number | null;
    status?: string | null;
    message?: string | null;
    requestedFields?: string[] | null;
    answeredAt?: string | null;
    adminSeenAt?: string | null;
  } | null;
  activeQuote?: {
    quotedAt?: string | null;
    finalAmountMzn?: number | null;
  } | null;
  actionRequired?: {
    required?: boolean;
    module?: string | null;
    nextActionLabel?: string | null;
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
  const queueStatus = order.quoteQueueStatus;

  if (queueStatus === "ARCHIVED" || status === "CANCELLED" || status === "FAILED" || status === "PAYMENT_REJECTED") {
    return "REJECTED";
  }

  if (queueStatus === "WAITING_CUSTOMER" || status === "QUOTED") {
    return "SENT";
  }

  if (
    queueStatus === "WAITING_PAYMENT" ||
    queueStatus === "TO_PURCHASE" ||
    queueStatus === "PURCHASED" ||
    queueStatus === "IN_TRANSIT" ||
    queueStatus === "ARRIVED" ||
    [
      "APPROVED",
      "PENDING_PAYMENT",
      "PAYMENT_SUBMITTED",
      "PAYMENT_UNDER_REVIEW",
      "PAID",
      "TO_PURCHASE",
      "ORDERED",
      "PURCHASED",
      "IN_TRANSIT",
      "ARRIVED",
      "READY_FOR_DELIVERY",
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
  const hasDraft = false;
  const status = normalizeQuoteStatus(order, hasDraft);

  // If admin requested clarification, classifier already returns WAITING_CUSTOMER
  // but the backend quoteQueueStatus field may still show the old value.
  // We override it here to stay in sync with the classifier logic.
  let quoteQueueStatus = order.quoteQueueStatus ?? (
    status === "REJECTED" ? "ARCHIVED" : status === "SENT" ? "WAITING_CUSTOMER" : "QUOTE_ANALYSIS"
  );
  if (
    order.needsClarification === true &&
    (quoteQueueStatus === "QUOTE_ANALYSIS" || quoteQueueStatus === "WAITING_CUSTOMER")
  ) {
    quoteQueueStatus = "WAITING_CUSTOMER";
  }

  const clarificationStatus = (order.activeClarificationRequest?.status as "PENDING" | "ANSWERED" | "CANCELLED" | undefined) ?? null;
  const clarificationId = order.activeClarificationRequest?.id ?? null;
  const clarificationAdminSeenAt = order.activeClarificationRequest?.adminSeenAt ?? null;
  if (clarificationStatus === "ANSWERED" && quoteQueueStatus === "WAITING_CUSTOMER") {
    quoteQueueStatus = "QUOTE_ANALYSIS";
  }

  const createdAt = order.orderDate ?? new Date().toISOString();
  const itemNames = extractSummaryItems(order.externalCartUrl);
  const actionRequired = Boolean(
    order.actionRequired?.required && (order.actionRequired?.module === "EXTERNAL_QUOTES" || order.nextActionModule === "EXTERNAL_QUOTES")
  );
  return {
    id: order.id,
    orderNumber: getOrderNumber(order),
    customerName: order.customerFullName || order.customerEmail || "Cliente externo",
    customerInitials: getCustomerInitials(order.customerFullName || order.customerEmail || "Cliente"),
    sourceStore: order.sourceStore || "EXTERNAL",
    storeLabel: getStoreLabel(order.sourceStore),
    status,
    quoteQueueStatus,
    operationalStatus: order.operationalStatus ?? String(order.status ?? "UNDER_REVIEW"),
    actionRequired,
    nextActionLabel: order.nextActionLabel ?? order.actionRequired?.nextActionLabel ?? null,
    nextActionModule: order.nextActionModule ?? order.actionRequired?.module ?? null,
    isArchived: Boolean(order.isArchived ?? quoteQueueStatus === "ARCHIVED"),
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
    clarificationStatus,
    clarificationId,
    clarificationAdminSeenAt,
  } satisfies AdminQuoteListItem;
}

function filterQuotes(items: AdminQuoteListItem[], filters: AdminQuotesFilterState) {
  let filtered = [...items];

  if (filters.status !== "ALL") {
    filtered = filtered.filter((item) => item.quoteQueueStatus === filters.status);
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
    const leftCustomerResponded =
      left.clarificationStatus === "ANSWERED" && left.clarificationAdminSeenAt == null;
    const rightCustomerResponded =
      right.clarificationStatus === "ANSWERED" && right.clarificationAdminSeenAt == null;

    if (leftCustomerResponded !== rightCustomerResponded) {
      return leftCustomerResponded ? -1 : 1;
    }

    const queuePriority: Record<AdminQuoteListItem["quoteQueueStatus"], number> = {
      QUOTE_ANALYSIS: 1,
      WAITING_CUSTOMER: 2,
      WAITING_PAYMENT: 3,
      TO_PURCHASE: 4,
      PURCHASED: 5,
      IN_TRANSIT: 6,
      ARRIVED: 7,
      ARCHIVED: 8,
    };
    const priorityDiff =
      (queuePriority[left.quoteQueueStatus] ?? 99) - (queuePriority[right.quoteQueueStatus] ?? 99);

    if (priorityDiff !== 0 && filters.sort !== "VALUE") {
      return priorityDiff;
    }

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
  const cards = orders.map(buildQuoteCardBase);
  const statuses = cards.map((order) => order.status);

  return {
    all: statuses.length,
    underReview: cards.filter((item) => item.quoteQueueStatus === "QUOTE_ANALYSIS").length,
    draft: statuses.filter((status) => status === "DRAFT").length,
    sent: statuses.filter((status) => status === "SENT").length,
    approved: statuses.filter((status) => status === "APPROVED").length,
    rejected: statuses.filter((status) => status === "REJECTED").length,
    pendingAnalysis: cards.filter((item) => item.quoteQueueStatus === "QUOTE_ANALYSIS").length,
    waitingCustomer: cards.filter((item) => item.quoteQueueStatus === "WAITING_CUSTOMER").length,
    waitingPayment: cards.filter((item) => item.quoteQueueStatus === "WAITING_PAYMENT").length,
    toPurchase: cards.filter((item) => item.quoteQueueStatus === "TO_PURCHASE").length,
    archived: cards.filter((item) => item.quoteQueueStatus === "ARCHIVED").length,
    customerRespondedCount: cards.filter(
      (item) =>
        item.clarificationStatus === "ANSWERED" &&
        item.clarificationAdminSeenAt == null
    ).length,
  };
}

export async function getQuoteDetail(request: NextRequest, id: string) {
  const detailBundle = await fetchOrderDetailBundle(request, id);

  if ("error" in detailBundle) {
    return detailBundle;
  }

  const detail = detailBundle.detail;
  const hasDraft = Boolean(detail.quoteDraft);
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
    quoteQueueStatus: detail.quoteQueueStatus ?? (status === "REJECTED" ? "ARCHIVED" : "QUOTE_ANALYSIS"),
    operationalStatus: detail.operationalStatus ?? detail.status,
    actionRequired: Boolean(detail.actionRequired),
    nextActionLabel: detail.nextActionLabel ?? null,
    nextActionModule: detail.nextActionModule ?? null,
    isArchived: Boolean(detail.isArchived ?? status === "REJECTED"),
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
    activeClarificationRequest: detail.activeClarificationRequest
      ? {
          id: detail.activeClarificationRequest.id,
          status: detail.activeClarificationRequest.status as "PENDING" | "ANSWERED" | "CANCELLED",
          message: detail.activeClarificationRequest.message ?? null,
          requestedFields: (detail.activeClarificationRequest.requestedFields as string[]) ?? [],
          answeredAt: detail.activeClarificationRequest.answeredAt ?? null,
          adminSeenAt: detail.activeClarificationRequest.adminSeenAt ?? null,
        }
      : null,
  };

  return { detail: response };
}
