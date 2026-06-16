import { NextRequest } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import { getProfileFromToken } from "@/lib/admin/jwt";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import type {
  DeliveryActiveOrder,
  DeliveryDriver,
  DeliveryDriverAvailability,
  DeliveryHistoryItem,
  DeliveryHistoryResponse,
  DeliveryOrderItem,
  DeliveryPendingOrder,
  DeliveryStatsResponse,
} from "@/lib/admin/types";

type UnknownRecord = Record<string, unknown>;

type BackendPage<T> = {
  content?: T[];
  totalElements?: number | null;
  totalPages?: number | null;
  number?: number | null;
  size?: number | null;
};

type BackendOrderItem = {
  productId?: number | null;
  productCode?: string | null;
  productName?: string | null;
  name?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  price?: number | null;
  subtotal?: number | null;
  originType?: string | null;
};

type BackendOrder = {
  id?: number | null;
  code?: string | null;
  orderCode?: string | null;
  customerCode?: string | null;
  customerFullName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  primaryPhoneNumber?: string | null;
  deliveryCity?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryStreet?: string | null;
  houseNumber?: string | null;
  deliveryReference?: string | null;
  googleMapsLink?: string | null;
  sourceStore?: string | null;
  orderDate?: string | null;
  officeArrivedAt?: string | null;
  status?: string | null;
  urgent?: boolean | null;
  deliveryFee?: number | null;
  estimatedDeliveryTime?: number | null;
  deliveryFeeSetAt?: string | null;
  deliveryFeeSetBy?: string | null;
  notes?: string | null;
  deliveryNotes?: string | null;
  itemSummary?: string | null;
  itemsSummary?: string[] | null;
  items?: BackendOrderItem[] | null;
  driverId?: string | null;
  driverName?: string | null;
  driverEmail?: string | null;
  driverAvatarUrl?: string | null;
  driverPhone?: string | null;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  assignedDriverEmail?: string | null;
  assignedDriverPhone?: string | null;
  leftOfficeAt?: string | null;
  deliveredAt?: string | null;
  baseAmount?: number | null;
  totalAmount?: number | null;
  totalAmountDue?: number | null;
  remainingAmountOnDelivery?: number | null;
  deliveryPaymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  payment?: {
    method?: string | null;
    status?: string | null;
  } | null;
  deliveryAttempt?: number | null;
  lastIssueType?: string | null;
};

const PENDING_DELIVERY_STATUSES = new Set(["READY_FOR_DELIVERY", "DELIVERY_FAILED"]);
const ACTIVE_DELIVERY_STATUSES = new Set(["OUT_FOR_DELIVERY", "AWAITING_DELIVERY_PAYMENT"]);

type BackendDriver = {
  id?: string | number | null;
  name?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  availability?: string | null;
  deliveriesToday?: number | null;
  deliveriesTotal?: number | null;
  successRate?: number | null;
  role?: string | null;
  roles?: string[] | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const normalized = readString(value);
  return normalized.length ? normalized : null;
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRequestProfile(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : request.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  return getProfileFromToken(token);
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function formatOrderNumber(id: number) {
  return `#${id}`;
}

function readOrderNumber(raw: BackendOrder, id: number) {
  return readNullableString(raw.orderCode ?? raw.code) ?? formatOrderNumber(id);
}

function buildAddress(raw: BackendOrder | UnknownRecord) {
  const pieces = [
    readString("deliveryStreet" in raw ? raw.deliveryStreet : null),
    readString("houseNumber" in raw ? raw.houseNumber : null),
    readString("deliveryNeighborhood" in raw ? raw.deliveryNeighborhood : null),
    readString("deliveryCity" in raw ? raw.deliveryCity : null),
  ].filter(Boolean);

  const reference = readString("deliveryReference" in raw ? raw.deliveryReference : null);
  return [pieces.join(", "), reference].filter(Boolean).join(" · ") || "Morada por confirmar";
}

function readItemsSummary(raw: BackendOrder): string[] {
  const itemNames = Array.isArray(raw.items)
    ? raw.items.map((item) => item.productName || item.name || "").filter(Boolean)
    : [];

  if (itemNames.length > 0) return itemNames.slice(0, 4);

  const explicitList = Array.isArray(raw.itemsSummary) ? raw.itemsSummary.filter(Boolean) : [];
  if (explicitList.length > 0) return explicitList.slice(0, 4);

  const summary = readString(raw.itemSummary);
  if (!summary) return [];

  return summary.split("|").map((item) => item.trim()).filter(Boolean).slice(0, 4);
}

function readItems(raw: BackendOrder): DeliveryOrderItem[] {
  if (!Array.isArray(raw.items) || raw.items.length === 0) return [];
  return raw.items.map((item) => ({
    productId: item.productId ?? null,
    productCode: readNullableString(item.productCode),
    productName: readString(item.productName) || readString(item.name) || "Produto",
    quantity: Number(item.quantity ?? 1),
    unitPrice: readNullableNumber(item.unitPrice ?? item.price),
    subtotal: readNullableNumber(item.subtotal),
    originType: readString(item.originType) || "LOCAL_STOCK",
  }));
}

function toAvailability(value: string | null | undefined): DeliveryDriverAvailability {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "ON_DELIVERY" || normalized === "OFFLINE") {
    return normalized;
  }
  return "AVAILABLE";
}

function mapPendingOrder(raw: BackendOrder): DeliveryPendingOrder {
  const id = readNumber(raw.id, 0);
  const items = readItems(raw);
  const itemsSummary = readItemsSummary(raw);

  return {
    id,
    orderCode: readNullableString(raw.orderCode ?? raw.code),
    customerCode: readNullableString(raw.customerCode),
    number: readNullableString(raw.orderCode ?? raw.code) ?? formatOrderNumber(id),
    customerName: readString(raw.customerFullName) || readString(raw.customerEmail) || "Cliente nao identificado",
    customerPhone: readNullableString(raw.customerPhone ?? raw.primaryPhoneNumber),
    address: buildAddress(raw),
    deliveryCity: readNullableString(raw.deliveryCity),
    deliveryNeighborhood: readNullableString(raw.deliveryNeighborhood),
    deliveryStreet: readNullableString(raw.deliveryStreet),
    houseNumber: readNullableString(raw.houseNumber),
    deliveryReference: readNullableString(raw.deliveryReference),
    googleMapsLink: readNullableString(raw.googleMapsLink),
    recipientName: readNullableString(raw.customerFullName),
    recipientPhone: readNullableString(raw.customerPhone ?? raw.primaryPhoneNumber),
    items,
    itemsSummary,
    sourceStore: readString(raw.sourceStore) || "Shopee X Digital",
    officeArrivedAt: readNullableString(raw.officeArrivedAt ?? raw.orderDate),
    status: readString(raw.status),
    urgent: readBoolean(raw.urgent, false),
    deliveryFee: readNullableNumber(raw.deliveryFee),
    baseAmount: readNullableNumber(raw.baseAmount),
    totalAmount: readNullableNumber(raw.totalAmount),
    estimatedDeliveryHours: readNullableNumber(raw.estimatedDeliveryTime),
    deliveryFeeSetAt: readNullableString(raw.deliveryFeeSetAt),
    deliveryFeeSetBy: readNullableString(raw.deliveryFeeSetBy),
    notes: readNullableString(raw.deliveryNotes ?? raw.notes),
    assignedDriverId: readNullableString(raw.assignedDriverId),
    assignedDriverName: readNullableString(raw.assignedDriverName),
    assignedDriverEmail: readNullableString(raw.assignedDriverEmail),
    assignedDriverPhone: readNullableString(raw.assignedDriverPhone),
    deliveryAttempt: readNullableNumber(raw.deliveryAttempt),
    lastIssueType: readNullableString(raw.lastIssueType),
  };
}

function mapActiveOrder(raw: BackendOrder): DeliveryActiveOrder {
  const id = readNumber(raw.id, 0);
  const leftOfficeAt = readNullableString(raw.leftOfficeAt);
  const elapsedMinutes = leftOfficeAt
    ? Math.max(0, Math.round((Date.now() - new Date(leftOfficeAt).getTime()) / 60000))
    : null;

  return {
    id,
    number: readOrderNumber(raw, id),
    customerName: readString(raw.customerFullName) || readString(raw.customerEmail) || "Cliente nao identificado",
    customerPhone: readNullableString(raw.customerPhone ?? raw.primaryPhoneNumber),
    address: buildAddress(raw),
    deliveryCity: readNullableString(raw.deliveryCity),
    deliveryNeighborhood: readNullableString(raw.deliveryNeighborhood),
    deliveryStreet: readNullableString(raw.deliveryStreet),
    houseNumber: readNullableString(raw.houseNumber),
    deliveryReference: readNullableString(raw.deliveryReference),
    googleMapsLink: readNullableString(raw.googleMapsLink),
    recipientName: readNullableString(raw.customerFullName),
    recipientPhone: readNullableString(raw.customerPhone ?? raw.primaryPhoneNumber),
    sourceStore: readString(raw.sourceStore) || "Shopee X Digital",
    driverId: readNullableString(raw.driverId),
    driverName: readNullableString(raw.driverName),
    driverEmail: readNullableString(raw.driverEmail) ?? readNullableString(raw.assignedDriverEmail),
    driverAvatarUrl: readNullableString(raw.driverAvatarUrl),
    driverPhone: readNullableString(raw.driverPhone) ?? readNullableString(raw.assignedDriverPhone),
    leftOfficeAt,
    elapsedMinutes,
    deliveryFee: readNullableNumber(raw.deliveryFee),
    items: readItems(raw),
    totalAmount: readNullableNumber(raw.totalAmount),
    estimatedDeliveryHours: readNullableNumber(raw.estimatedDeliveryTime),
    status: readString(raw.status) || "OUT_FOR_DELIVERY",
    urgent: readBoolean(raw.urgent, false),
    deliveryAttempt: readNullableNumber(raw.deliveryAttempt),
    paymentMethod: readNullableString(raw.paymentMethod ?? raw.payment?.method),
    paymentStatus: readNullableString(raw.paymentStatus ?? raw.payment?.status),
    deliveryPaymentStatus: readNullableString(raw.deliveryPaymentStatus),
    remainingAmountOnDelivery: readNullableNumber(raw.remainingAmountOnDelivery),
    totalAmountDue: readNullableNumber(raw.totalAmountDue ?? raw.remainingAmountOnDelivery),
  };
}

function mapHistoryOrder(raw: BackendOrder): DeliveryHistoryItem {
  const id = readNumber(raw.id, 0);
  const leftOfficeAt = readNullableString(raw.leftOfficeAt);
  const deliveredAt = readNullableString(raw.deliveredAt);
  const durationMinutes =
    leftOfficeAt && deliveredAt
      ? Math.max(0, Math.round((new Date(deliveredAt).getTime() - new Date(leftOfficeAt).getTime()) / 60000))
      : null;
  const issueType = readNullableString(raw.lastIssueType);

  return {
    id,
    number: readOrderNumber(raw, id),
    customerName: readString(raw.customerFullName) || readString(raw.customerEmail) || "Cliente nao identificado",
    driverName: readNullableString(raw.driverName) ?? readNullableString(raw.assignedDriverName),
    deliveryFee: readNullableNumber(raw.deliveryFee),
    leftOfficeAt,
    deliveredAt,
    durationMinutes,
    sourceStore: readString(raw.sourceStore) || "Shopee X Digital",
    status: issueType ? "PROBLEM" : "DELIVERED",
    issueType,
  };
}

function isRealDeliveryHistoryRecord(raw: BackendOrder) {
  const status = readString(raw.status);
  const leftOfficeAt = readNullableString(raw.leftOfficeAt);
  const deliveredAt = readNullableString(raw.deliveredAt);
  const driverName = readNullableString(raw.driverName) ?? readNullableString(raw.assignedDriverName) ?? null;
  const driverId = readNullableString(raw.driverId) ?? readNullableString(raw.assignedDriverId) ?? null;
  const hasIssue = readNullableString(raw.lastIssueType) != null;

  if (status === "DELIVERED") {
    return Boolean(leftOfficeAt && deliveredAt && (driverId || driverName));
  }

  return Boolean(hasIssue && (leftOfficeAt || driverId || driverName));
}

function isUsableHistoryItem(item: DeliveryHistoryItem) {
  if (item.status === "DELIVERED") {
    return Boolean(item.leftOfficeAt && item.deliveredAt && item.driverName);
  }

  return Boolean(item.issueType && (item.leftOfficeAt || item.driverName));
}

function mapDriver(raw: BackendDriver): DeliveryDriver {
  return {
    id: String(raw.id ?? ""),
    name: readString(raw.name) || readString(raw.fullName) || "Estafeta",
    email: readString(raw.email) || "sem-email@admin",
    phone: readNullableString(raw.phone) ?? readNullableString(raw.phoneNumber),
    avatarUrl: readNullableString(raw.avatarUrl),
    availability: toAvailability(readNullableString(raw.availability)),
    deliveriesToday: readNumber(raw.deliveriesToday, 0),
    deliveriesTotal: readNumber(raw.deliveriesTotal, 0),
    successRate: readNumber(raw.successRate, 0),
  };
}

async function fetchOrdersFallback(request: NextRequest) {
  const response = await fetchBackend(request, "/admin/orders?page=0&size=250");
  await relayAuthFailure(response);

  if (!response.ok) {
    return [];
  }

  const payload = await parseBackendJson<BackendPage<BackendOrder>>(response);
  return payload?.content ?? [];
}

async function fetchDriversFallback(request: NextRequest) {
  const response = await fetchBackend(request, "/super-admin/admins");
  await relayAuthFailure(response);

  if (!response.ok) {
    return [];
  }

  const payload = await parseBackendJson<unknown>(response);
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload)?.content)
      ? (asRecord(payload)?.content as unknown[])
      : [];

  return records
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .filter((item) => {
      const role = readString(item.role);
      const roles = Array.isArray(item.roles) ? item.roles.map((value) => readString(value)) : [];
      return role === "DELIVERY_DRIVER" || role === "DELIVERY_MANAGER" || roles.includes("DELIVERY_DRIVER");
    })
    .map((item) =>
      mapDriver({
        id: String(item.id ?? ""),
        name: readString(item.name) || `${readString(item.firstName)} ${readString(item.lastName)}`.trim(),
        email: readString(item.email),
        phone: readNullableString(item.phone) ?? readNullableString(item.phoneNumber),
        avatarUrl: readNullableString(item.avatarUrl),
      })
    );
}

export async function fetchDeliveryStats(request: NextRequest): Promise<DeliveryStatsResponse | { error: ReturnType<typeof jsonError> }> {
  const response = await fetchBackend(request, "/admin/delivery/stats");
  await relayAuthFailure(response);

  if (response.ok) {
    const payload = (await parseBackendJson<UnknownRecord>(response)) ?? {};
    return {
      awaitingAtOffice: readNumber(payload.awaitingAtOffice ?? payload.pendingAtOffice, 0),
      activeNow: readNumber(payload.activeNow ?? payload.activeDeliveries, 0),
      deliveredToday: readNumber(payload.deliveredToday, 0),
      successRate: readNumber(payload.successRate, 0),
    };
  }

  const orders = await fetchOrdersFallback(request);
  const deliveredToday = orders.filter((order) => {
    const date = readNullableString(order.deliveredAt);
    return date?.slice(0, 10) === new Date().toISOString().slice(0, 10);
  }).length;
  const completed = orders.filter((order) => readString(order.status) === "DELIVERED").length;

  return {
    awaitingAtOffice: orders.filter((order) => PENDING_DELIVERY_STATUSES.has(readString(order.status))).length,
    activeNow: orders.filter((order) => ACTIVE_DELIVERY_STATUSES.has(readString(order.status))).length,
    deliveredToday,
    successRate: completed > 0 ? 100 : 100,
  };
}

export async function fetchPendingDeliveryOrders(request: NextRequest): Promise<DeliveryPendingOrder[] | { error: ReturnType<typeof jsonError> }> {
  const response = await fetchBackend(request, "/admin/delivery/pending");
  await relayAuthFailure(response);

  if (response.ok) {
    const payload = await parseBackendJson<BackendPage<BackendOrder> | BackendOrder[]>(response);
    const list = Array.isArray(payload) ? payload : payload?.content ?? [];
    return list
      .filter((order) => PENDING_DELIVERY_STATUSES.has(readString(order.status)))
      .map(mapPendingOrder);
  }

  const orders = await fetchOrdersFallback(request);
  return orders
    .filter((order) => PENDING_DELIVERY_STATUSES.has(readString(order.status)))
    .map(mapPendingOrder);
}

export async function fetchActiveDeliveryOrders(request: NextRequest): Promise<DeliveryActiveOrder[] | { error: ReturnType<typeof jsonError> }> {
  const response = await fetchBackend(request, "/admin/delivery/active");
  await relayAuthFailure(response);

  if (response.ok) {
    const payload = await parseBackendJson<BackendPage<BackendOrder> | BackendOrder[]>(response);
    const list = Array.isArray(payload) ? payload : payload?.content ?? [];
    return list
      .filter((order) => ACTIVE_DELIVERY_STATUSES.has(readString(order.status)))
      .map(mapActiveOrder);
  }

  const orders = await fetchOrdersFallback(request);
  return orders
    .filter((order) => ACTIVE_DELIVERY_STATUSES.has(readString(order.status)))
    .map(mapActiveOrder);
}

function mergeActiveOrders(primary: DeliveryActiveOrder[], extra: DeliveryActiveOrder[]) {
  const byId = new Map<number, DeliveryActiveOrder>();
  for (const item of [...extra, ...primary]) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export async function fetchDeliveryHistory(request: NextRequest): Promise<DeliveryHistoryResponse | { error: ReturnType<typeof jsonError> }> {
  const { searchParams } = new URL(request.url);
  const driverId = searchParams.get("driverId") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page") ?? "0");
  const size = Number(searchParams.get("size") ?? "10");
  const sourceStore = searchParams.get("sourceStore") ?? "";
  const period = searchParams.get("period") ?? "";
  const query = new URLSearchParams({ driverId, status, page: String(page), size: String(size), sourceStore, period });
  const response = await fetchBackend(request, `/admin/delivery/history?${query.toString()}`);
  await relayAuthFailure(response);

  if (response.ok) {
    const payload = (await parseBackendJson<DeliveryHistoryResponse | DeliveryHistoryItem[]>(response)) ?? {
      content: [],
      page,
      size,
      totalElements: 0,
      totalPages: 1,
    };
    if (Array.isArray(payload)) {
      const content = payload.filter(isUsableHistoryItem);
      return {
        content,
        page,
        size,
        totalElements: content.length,
        totalPages: Math.max(1, Math.ceil(content.length / Math.max(size, 1))),
      };
    }

    const content = Array.isArray(payload.content) ? payload.content.filter(isUsableHistoryItem) : [];
    return {
      content,
      page: readNumber(payload.page, page),
      size: readNumber(payload.size, size),
      totalElements: readNumber(payload.totalElements, content.length),
      totalPages: Math.max(1, readNumber(payload.totalPages, 1)),
    };
  }

  let items = (await fetchOrdersFallback(request))
    .filter((order) => {
      return isRealDeliveryHistoryRecord(order);
    })
    .map(mapHistoryOrder);

  if (driverId) {
    // In fallback mode the backend is unavailable; skip driver filter
    void driverId;
  }
  if (status) {
    items = items.filter((item) => item.status === status);
  }
  if (sourceStore) {
    items = items.filter((item) => item.sourceStore === sourceStore);
  }
  if (period) {
    items = items.filter((item) => {
      const date = item.deliveredAt ?? item.leftOfficeAt;
      return date ? date.slice(0, 10) === period : false;
    });
  }

  const start = page * size;
  const sliced = items.slice(start, start + size);
  return {
    content: sliced,
    page,
    size,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
  };
}

export async function fetchDeliveryDrivers(request: NextRequest): Promise<DeliveryDriver[] | { error: ReturnType<typeof jsonError> }> {
  const response = await fetchBackend(request, "/admin/delivery/drivers");
  await relayAuthFailure(response);

  if (response.ok) {
    const payload = await parseBackendJson<BackendPage<BackendDriver> | BackendDriver[]>(response);
    const list = Array.isArray(payload) ? payload : payload?.content ?? [];
    return list.map(mapDriver);
  }

  return fetchDriversFallback(request);
}
