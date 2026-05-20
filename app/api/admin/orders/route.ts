import { NextRequest, NextResponse } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import {
  isQueueStatus,
  isRawAdminOrderStatus,
  resolveCustomerOrderStage,
  resolveOrderQueueStatus,
  resolveUiOrderStatus,
} from "@/lib/admin/order-status";
import type {
  AdminOrderListItem,
  OrdersPageResponse,
  PendingQuote,
  RecentOrder,
} from "@/lib/admin/types";

type BackendPage<T> = {
  content?: T[];
  number?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
};

type BackendOrder = {
  id: number;
  code?: string | null;
  orderCode?: string | null;
  customerEmail?: string;
  customerFullName?: string;
  type?: "EXTERNAL" | "INTERNAL";
  deliveryMethod?: "DELIVERY" | "STORE_PICKUP" | null;
  totalAmount?: number;
  status?: string;
  orderStatus?: string | null;
  operationalStatusLabel?: string | null;
  customerStatusLabel?: string | null;
  fulfillmentStatus?: string | null;
  orderDate?: string;
  externalCartUrl?: string | null;
  sourceStore?: string | null;
  activeQuote?: {
    finalAmountMzn?: number;
  } | null;
  payment?: {
    status?: string | null;
    method?: string | null;
  } | null;
  actionRequired?: {
    required?: boolean;
    module?: string | null;
    reason?: string | null;
    nextActionLabel?: string | null;
  } | null;
  actionModule?: string | null;
  actionReason?: string | null;
  nextActionLabel?: string | null;
};

function getOrderNumber(order: Pick<BackendOrder, "id" | "code" | "orderCode">) {
  return order.code || order.orderCode || `#${order.id}`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CL";
}

function mapPriority(order: BackendOrder) {
  const operationalStatus = order.orderStatus ?? order.status;
  const uiStatus = resolveUiOrderStatus(operationalStatus, order.type ?? "INTERNAL");
  const createdAt = new Date(order.orderDate ?? 0).getTime();
  const hoursOpen = Number.isFinite(createdAt) ? (Date.now() - createdAt) / 36e5 : 0;

  if (uiStatus === "UNDER_REVIEW" && hoursOpen >= 24) {
    return { priority: "HIGH" as const, priorityLabel: "Alta" };
  }

  if (["UNDER_REVIEW", "QUOTED", "PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"].includes(uiStatus) || hoursOpen >= 8) {
    return { priority: "MEDIUM" as const, priorityLabel: "Media" };
  }

  return { priority: "LOW" as const, priorityLabel: "Baixa" };
}

function mapAdminOrder(order: BackendOrder): AdminOrderListItem {
  const customer = order.customerFullName || order.customerEmail || "Cliente nao identificado";
  const priority = mapPriority(order);
  const operationalStatus = order.orderStatus ?? order.status ?? "UNDER_REVIEW";
  const rawStatus = order.payment?.status === "FAILED" ? "FAILED" : operationalStatus;

  return {
    id: order.id,
    number: getOrderNumber(order),
    customer,
    customerEmail: order.customerEmail ?? "",
    customerInitials: getInitials(customer),
    type: order.type ?? "INTERNAL",
    totalAmount: Number(order.totalAmount ?? 0),
    status: operationalStatus,
    orderStatus: operationalStatus,
    operationalStatusLabel: order.operationalStatusLabel ?? null,
    customerStatusLabel: order.customerStatusLabel ?? null,
    fulfillmentStatus: order.fulfillmentStatus ?? order.orderStatus ?? order.status ?? null,
    uiStatus: resolveUiOrderStatus(rawStatus, order.type ?? "INTERNAL"),
    queueStatus: resolveOrderQueueStatus(operationalStatus),
    customerStage: resolveCustomerOrderStage(rawStatus),
    priority: priority.priority,
    priorityLabel: priority.priorityLabel,
    createdAt: order.orderDate ?? new Date().toISOString(),
    sourceStore: order.sourceStore || (order.type === "EXTERNAL" ? "Loja externa" : "Shopee X Digital"),
    externalCartUrl: order.externalCartUrl ?? null,
    actionHref: `/admin/orders/${order.id}`,
    paymentStatus: order.payment?.status ?? null,
    paymentMethod: order.payment?.method ?? null,
    deliveryMethod: order.deliveryMethod ?? null,
    actionRequired: Boolean(order.actionRequired?.required ?? false),
    actionModule: order.actionModule ?? order.actionRequired?.module ?? null,
    actionReason: order.actionReason ?? order.actionRequired?.reason ?? null,
    nextActionLabel: order.nextActionLabel ?? order.actionRequired?.nextActionLabel ?? null,
  };
}

function mapRecentOrder(order: BackendOrder): RecentOrder {
  const rawStatus = order.status ?? "UNDER_REVIEW";
  const orderId = Number(order.id);
  const actionHref =
    order.type === "EXTERNAL"
      ? `/admin/orders/${orderId}/quote`
      : `/admin/orders/${orderId}`;

  return {
    id: orderId,
    number: getOrderNumber(order),
    customer: order.customerFullName || order.customerEmail || "Cliente nao identificado",
    type: order.type ?? "INTERNAL",
    totalAmount: Number(order.totalAmount ?? 0),
    status: resolveCustomerOrderStage(rawStatus),
    createdAt: order.orderDate ?? new Date().toISOString(),
    actionLabel: order.type === "EXTERNAL" ? "Ver proposta" : "Abrir pedido",
    actionHref,
  };
}

function mapPendingQuote(order: BackendOrder): PendingQuote {
  const itemCount = order.externalCartUrl
    ? order.externalCartUrl
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean).length
    : 0;

  return {
    id: order.id,
    customer: order.customerFullName || order.customerEmail || "Cliente sem nome",
    store: order.sourceStore || "Loja externa",
    itemCount: itemCount || 1,
    estimatedValue: Number(order.activeQuote?.finalAmountMzn ?? order.totalAmount ?? 0),
    externalUrl: order.externalCartUrl ?? null,
  };
}

function isPendingQuoteCandidate(order: AdminOrderListItem) {
  if (order.type !== "EXTERNAL") {
    return false;
  }

  return ["UNDER_REVIEW", "QUOTED", "PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"].includes(order.uiStatus);
}

function matchesStatusFilter(order: AdminOrderListItem, status: string | null) {
  if (!status || status === "ALL") {
    return true;
  }

  if (isQueueStatus(status)) {
    return order.queueStatus === status;
  }

  if (isRawAdminOrderStatus(status)) {
    return order.uiStatus === status;
  }

  return false;
}

function matchesSearch(order: AdminOrderListItem, rawSearch: string | null) {
  const search = rawSearch?.trim().toLowerCase();
  if (!search) {
    return true;
  }

  return [
    order.number.toLowerCase(),
    order.customer.toLowerCase(),
    order.customerEmail.toLowerCase(),
    order.sourceStore.toLowerCase(),
    String(order.id),
  ].some((value) => value.includes(search));
}

function matchesDate(order: AdminOrderListItem, date: string | null) {
  if (!date) {
    return true;
  }

  return order.createdAt.slice(0, 10) === date;
}

function matchesPeriod(order: AdminOrderListItem, period: string | null) {
  if (!period || period === "ALL") {
    return true;
  }

  const orderDate = new Date(order.createdAt);
  const now = new Date();

  if (period === "TODAY") {
    return orderDate.toDateString() === now.toDateString();
  }

  if (period === "THIS_WEEK") {
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    return orderDate >= weekAgo && orderDate <= now;
  }

  return true;
}

function buildFilteredEndpoint(searchParams: URLSearchParams, page: number, size: number) {
  const status = searchParams.get("status");
  const date = searchParams.get("date");
  const canUseRawStatusFilter = status && status !== "ALL" && isRawAdminOrderStatus(status);

  if (canUseRawStatusFilter) {
    const fromDate = date || undefined;
    const toDate = date || undefined;
    const dateQuery =
      fromDate && toDate ? `&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}` : "";
    return `/admin/orders/filters?status=${encodeURIComponent(status)}${dateQuery}&page=${page}&size=${size}`;
  }

  return `/admin/orders?page=${page}&size=${size}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const date = searchParams.get("date");
  const period = searchParams.get("period");
  const page = Number(searchParams.get("page") ?? "0");
  const size = Number(searchParams.get("size") ?? "10");
  const limit = Number(searchParams.get("limit") ?? "5");
  const mode = searchParams.get("mode");
  const hasSearch = Boolean(search?.trim());
  const hasPeriod = Boolean(period && period !== "ALL");
  const hasTypeFilter = Boolean(type && type !== "ALL");
  const hasUnsupportedDateFilter = Boolean(date && (!status || status === "ALL"));
  const hasCustomStatusFilter = Boolean(status && status !== "ALL" && !isRawAdminOrderStatus(status));
  const canUseBackendPagination =
    !hasSearch &&
    !hasPeriod &&
    !hasTypeFilter &&
    !hasUnsupportedDateFilter &&
    !hasCustomStatusFilter &&
    mode !== "pendingQuotes";
  const isRecentOnlyMode =
    mode === "dashboardRecent" || Boolean(searchParams.get("limit") && !searchParams.get("page") && !searchParams.get("size"));
  const backendPage = canUseBackendPagination && !isRecentOnlyMode ? page : 0;
  const backendSize = isRecentOnlyMode ? limit : canUseBackendPagination ? size : 250;

  const response = await fetchBackend(
    request,
    buildFilteredEndpoint(searchParams, backendPage, Math.max(backendSize, 1))
  );
  await relayAuthFailure(response);

  if (!response.ok) {
    return jsonError("Nao foi possivel carregar pedidos administrativos.", response.status);
  }

  const payload = await parseBackendJson<BackendPage<BackendOrder>>(response);
  let content = (payload?.content ?? []).map(mapAdminOrder);

  if (type && type !== "ALL") {
    content = content.filter((order) => order.type === type);
  }

  content = content
    .filter((order) => matchesStatusFilter(order, status))
    .filter((order) => matchesSearch(order, search))
    .filter((order) => matchesDate(order, date))
    .filter((order) => matchesPeriod(order, period))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  if (mode === "dashboardRecent") {
    return NextResponse.json(
      content.slice(0, limit).map((order) =>
        mapRecentOrder({
          id: order.id,
          code: order.number,
          customerFullName: order.customer,
          customerEmail: order.customerEmail,
          type: order.type,
          totalAmount: order.totalAmount,
          status: order.status,
          orderDate: order.createdAt,
        })
      )
    );
  }

  if (mode === "pendingQuotes") {
    return NextResponse.json(
      content.filter(isPendingQuoteCandidate).slice(0, limit).map((order) =>
        mapPendingQuote({
          id: order.id,
          code: order.number,
          customerFullName: order.customer,
          customerEmail: order.customerEmail,
          totalAmount: order.totalAmount,
          sourceStore: order.sourceStore,
          externalCartUrl: order.externalCartUrl,
        })
      )
    );
  }

  if (searchParams.get("limit") && !searchParams.get("page") && !searchParams.get("size")) {
    return NextResponse.json(
      content.slice(0, limit).map((order) =>
        mapRecentOrder({
          id: order.id,
          code: order.number,
          customerFullName: order.customer,
          customerEmail: order.customerEmail,
          type: order.type,
          totalAmount: order.totalAmount,
          status: order.status,
          orderDate: order.createdAt,
        })
      )
    );
  }

  if (canUseBackendPagination) {
    const result: OrdersPageResponse = {
      content,
      page: Number(payload?.number ?? page),
      size: Number(payload?.size ?? size),
      totalElements: Number(payload?.totalElements ?? content.length),
      totalPages: Math.max(1, Number(payload?.totalPages ?? 1)),
    };

    return NextResponse.json(result);
  }

  const start = page * size;
  const sliced = content.slice(start, start + size);

  const result: OrdersPageResponse = {
    content: sliced,
    page,
    size,
    totalElements: content.length,
    totalPages: Math.max(1, Math.ceil(content.length / size)),
  };

  return NextResponse.json(result);
}
