import { NextRequest } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import type {
  AuditLogItem,
  ExternalOrderDetail,
  ExternalOrderLineItem,
  OrderPaymentDetail,
  OrderHistoryEntry,
} from "@/lib/admin/types";

type BackendPage<T> = {
  content?: T[];
};

type BackendQuoteHistory = {
  quotedAt?: string | null;
  finalAmountMzn?: number | null;
};

type BackendOrderItem = {
  productId?: number | null;
  productCode?: string | null;
  productName?: string | null;
  quantity?: number | null;
  price?: number | null;
  subtotal?: number | null;
  variantId?: number | null;
  variantSku?: string | null;
  variantName?: string | null;
  variantLabel?: string | null;
  selectedVariantLabel?: string | null;
  variantAttributesSnapshot?: string | null;
  variantAttributesJson?: string | null;
  variantAttributes?: Record<string, string> | null;
};

type BackendProductVariant = {
  sku?: string | null;
  color?: string | null;
  size?: string | null;
  stock?: number | null;
};

type BackendProductDetail = {
  id?: number | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  subCategory?: string | null;
  primaryImageUrl?: string | null;
  primaryThumbnailUrl?: string | null;
  stock?: number | null;
  category?: {
    name?: string | null;
  } | null;
  variants?: BackendProductVariant[] | null;
};

type BackendOrderDetail = {
  id: number;
  code?: string | null;
  orderCode?: string | null;
  customerEmail?: string;
  customerFullName?: string;
  customerNotes?: string;
  primaryPhoneNumber?: string;
  alternativePhoneNumber?: string;
  deliveryCity?: string;
  deliveryNeighborhood?: string;
  deliveryStreet?: string;
  houseNumber?: string;
  deliveryReference?: string;
  googleMapsLink?: string;
  type?: "EXTERNAL" | "INTERNAL";
  deliveryMethod?: "DELIVERY" | "STORE_PICKUP" | null;
  paymentMethod?: string | null;
  codEnabled?: boolean | null;
  depositRequired?: boolean | null;
  depositAmount?: number | null;
  remainingAmountOnDelivery?: number | null;
  deliveryPaymentStatus?: string | null;
  urgent?: boolean | null;
  status?: string;
  operationalStatus?: string | null;
  timelineType?: string | null;
  currentTimelineStep?: string | null;
  completedTimelineSteps?: string[] | null;
  paymentDisplayStatus?: string | null;
  customerDisplayStatus?: string | null;
  trackingDetailSteps?: Array<{
    key?: string | null;
    label?: string | null;
    description?: string | null;
    state?: "COMPLETED" | "CURRENT" | "PENDING" | "FAILED" | string | null;
    occurredAt?: string | null;
  }> | null;
  quoteQueueStatus?: ExternalOrderDetail["quoteQueueStatus"] | null;
  nextActionLabel?: string | null;
  nextActionModule?: string | null;
  allowedActions?: string[] | null;
  isArchived?: boolean | null;
  actionRequired?: {
    required?: boolean;
    module?: string | null;
    nextActionLabel?: string | null;
  } | null;
  externalCartUrl?: string | null;
  requestInputType?: "LINK" | "DESCRIPTION" | null;
  productDetails?: string | null;
  originalRawMessage?: string | null;
  cleanDescription?: string | null;
  cleanedTitle?: string | null;
  detectedLinks?: string[] | null;
  promotionalTextRemoved?: boolean | null;
  requestedQuantity?: number | null;
  requestScreenshotUrl?: string | null;
  requestScreenshotUrls?: string[] | null;
  needsCustomerCorrection?: boolean | null;
  needsClarification?: boolean | null;
  customerCorrectionNote?: string | null;
  activeClarificationRequest?: ExternalOrderDetail["activeClarificationRequest"] | null;
  latestClarificationRequest?: ExternalOrderDetail["latestClarificationRequest"] | null;
  customerEditable?: boolean | null;
  purchaseConfirmedAt?: string | null;
  purchaseProofUrl?: string | null;
  purchaseProofUploadedAt?: string | null;
  purchasedByAdminId?: number | null;
  supplierPurchaseAmount?: number | null;
  supplierOrderReference?: string | null;
  supplierName?: string | null;
  purchaseNote?: string | null;
  sourceStore?: string | null;
  orderDate?: string | null;
  totalAmount?: number | null;
  totalBeforeDiscount?: number | null;
  totalAfterDiscount?: number | null;
  suggestedBaseAmount?: number | null;
  baseAmount?: number | null;
  commissionAmount?: number | null;
  deliveryFee?: number | null;
  couponCode?: string | null;
  discountAmount?: number | null;
  quoteSentAt?: string | null;
  quoteTokenExpiresAt?: string | null;
  quoteAcceptedAt?: string | null;
  quoteRejectedAt?: string | null;
  quoteRejectedReason?: string | null;
  activeQuote?: {
    quotedAt?: string | null;
    finalAmountMzn?: number | null;
    productPrice?: number | null;
    shippingFee?: number | null;
    exchangeRate?: number | null;
    currency?: string | null;
    commissionPercentage?: number | null;
    returnRiskPercentage?: number | null;
    customsTypeSnapshot?: string | null;
    customsValueSnapshot?: number | null;
    customsPercentSnapshot?: number | null;
    operationalCostPercentage?: number | null;
    urgentPercentage?: number | null;
    urgentAmount?: number | null;
  } | null;
  items?: BackendOrderItem[] | null;
};

function getOrderNumber(order: Pick<BackendOrderDetail, "id" | "code" | "orderCode">) {
  return order.code || order.orderCode || `#${order.id}`;
}

function finalOrderTotal(order: Pick<BackendOrderDetail, "totalAmount" | "totalAfterDiscount">) {
  const discounted = Number(order.totalAfterDiscount ?? 0);
  return discounted > 0 ? discounted : Number(order.totalAmount ?? 0);
}

type BackendPaymentDetail = {
  id?: number | null;
  amount?: number | null;
  method?: string | null;
  provider?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  checkoutUrl?: string | null;
  expectedAmount?: number | null;
  status?: string | null;
  transactionId?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
  notes?: string | null;
  adminNote?: string | null;
  paymentDate?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

type BackendCustomer = {
  id?: number;
};

function normalizeCustomerLookupPayload(payload: unknown): BackendCustomer[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const maybePage = payload as { content?: unknown; id?: number };

    if (Array.isArray(maybePage.content)) {
      return maybePage.content as BackendCustomer[];
    }

    if (maybePage.id != null) {
      return [maybePage as BackendCustomer];
    }
  }

  return [];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function parseSummaryItems(summary: string, suggestedBaseAmount: number): ExternalOrderLineItem[] {
  const segments = summary
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!segments.length) {
    return [];
  }

  const fallbackPrice = segments.length > 0 ? suggestedBaseAmount / segments.length : suggestedBaseAmount;

  return segments.map((segment, index) => {
    const quantityMatch = segment.match(/x(\d+)$/i);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    const name = segment.replace(/\s*x\d+$/i, "").trim() || `Item ${index + 1}`;

    return {
      id: `summary-${index + 1}`,
      sequence: index + 1,
      name,
      details: "Origem externa · detalhes a confirmar",
      quantity,
      originalPriceUsd: Number((fallbackPrice / Math.max(quantity, 1)).toFixed(2)),
    };
  });
}

function isExternalOrder(order: BackendOrderDetail) {
  const type = String(order.type ?? "").toUpperCase();
  return type === "EXTERNAL" || type === "INTERNATIONAL";
}

function parseVariantAttributes(item: BackendOrderItem) {
  if (item.variantAttributes && typeof item.variantAttributes === "object") {
    return item.variantAttributes;
  }

  if (item.variantAttributesJson) {
    try {
      const parsed = JSON.parse(item.variantAttributesJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // Older rows can still have only the semicolon snapshot.
    }
  }

  const attributes: Record<string, string> = {};
  for (const part of (item.variantAttributesSnapshot ?? "").split(";")) {
    const [key, value] = part.split("=");
    if (key?.trim() && value?.trim()) {
      attributes[key.trim()] = value.trim();
    }
  }
  return Object.keys(attributes).length ? attributes : null;
}

function formatVariantLabel(item: BackendOrderItem) {
  const attributes = parseVariantAttributes(item);
  const fromAttributes = attributes
    ? Object.entries(attributes)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ")
    : null;

  return item.selectedVariantLabel
    || fromAttributes
    || item.variantLabel
    || item.variantName
    || item.variantSku
    || null;
}

function mapExternalItems(
  items: BackendOrderItem[] | null | undefined,
  fallbackSummary: string,
  suggestedBaseAmount: number
): ExternalOrderLineItem[] {
  if (items?.length) {
    return items.map((item, index) => ({
      id: String(item.productId ?? `item-${index + 1}`),
      sequence: index + 1,
      name: item.productName || `Item ${index + 1}`,
      productCode: item.productCode ?? null,
      details: `Quantidade ${item.quantity ?? 1} · preço original ${(Number(item.price ?? 0)).toFixed(2)}`,
      quantity: Number(item.quantity ?? 1),
      originalPriceUsd: Number(item.price ?? 0),
      subtotal: Number(item.subtotal ?? Number(item.price ?? 0) * Number(item.quantity ?? 1)),
      variantLabel: formatVariantLabel(item),
      variantSku: item.variantSku ?? null,
      variantAttributes: parseVariantAttributes(item),
    }));
  }

  if (fallbackSummary) {
    return parseSummaryItems(fallbackSummary, suggestedBaseAmount);
  }

  return [
    {
      id: "fallback-1",
      sequence: 1,
      name: "Carrinho externo submetido",
      details: "Itens não vieram detalhados do backend atual",
      quantity: 1,
      originalPriceUsd: Number(suggestedBaseAmount.toFixed(2)),
    },
  ];
}

function pickVariantLabel(product: BackendProductDetail | null | undefined) {
  const variant = product?.variants?.find((item) => item && (item.color || item.size || item.sku))
    ?? product?.variants?.[0];

  if (!variant) {
    return null;
  }

  return [variant.color, variant.size, variant.sku]
    .filter(Boolean)
    .join(" · ") || null;
}

function enrichExternalItems(
  items: ExternalOrderLineItem[],
  productsById: Map<number, BackendProductDetail>
): ExternalOrderLineItem[] {
  return items.map((item) => {
    const productId = Number(item.id);
    const product = Number.isFinite(productId) ? productsById.get(productId) : undefined;

    if (!product) {
      return item;
    }

    return {
      ...item,
      productId,
      productCode: item.productCode ?? product.code ?? null,
      imageUrl: product.primaryThumbnailUrl ?? product.primaryImageUrl ?? null,
      productDescription: product.description ?? null,
      variantLabel: item.variantLabel ?? null,
      categoryName: product.category?.name ?? product.subCategory ?? null,
      stockLabel:
        typeof product.stock === "number"
          ? `${product.stock} em stock`
          : null,
      details:
        [
          item.variantLabel,
          product.category?.name ?? product.subCategory ?? null,
          item.details,
        ]
          .filter(Boolean)
          .join(" · "),
    };
  });
}

function buildHistory(
  order: BackendOrderDetail,
  quoteHistory: BackendQuoteHistory[],
  payment: BackendPaymentDetail | null,
  trackingCode: string
): OrderHistoryEntry[] {
  const quoteSentAt = quoteHistory[0]?.quotedAt ?? order.activeQuote?.quotedAt ?? null;
  const status = String(order.status ?? "UNDER_REVIEW");
  const flow = [
    "CREATED",
    "UNDER_REVIEW",
    "QUOTED",
    "PENDING_PAYMENT",
    "PAID",
    "ORDERED",
    "IN_TRANSIT",
    "ARRIVED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ];
  const normalizedStatus = status;
  const currentIndex = flow.indexOf(normalizedStatus);

  const timeline = flow.map((step) => {
    const stepIndex = flow.indexOf(step);
    const state =
      currentIndex === -1
        ? "future"
        : stepIndex < currentIndex
          ? "done"
          : stepIndex === currentIndex
            ? "current"
            : "future";

    const dateMap: Record<string, string | null> = {
      CREATED: order.orderDate ?? null,
      UNDER_REVIEW: order.orderDate ?? null,
      QUOTED: quoteSentAt,
      PENDING_PAYMENT: status === "PENDING_PAYMENT" ? order.orderDate ?? null : null,
      PAID: payment?.reviewedAt ?? payment?.paymentDate ?? payment?.submittedAt ?? null,
      ORDERED: ["ORDERED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status)
        ? order.orderDate ?? null
        : null,
      IN_TRANSIT: ["IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status) && trackingCode
        ? new Date().toISOString()
        : null,
      ARRIVED: ["ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status) ? new Date().toISOString() : null,
      OUT_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "DELIVERED"].includes(status)
        ? new Date().toISOString()
        : null,
      DELIVERED: normalizedStatus === "DELIVERED" ? new Date().toISOString() : null,
    };

    return {
      id: step.toLowerCase(),
      label:
        step === "CREATED"
          ? "Pedido criado"
          : step === "UNDER_REVIEW"
            ? "Pedido recebido para revisão"
            : step === "QUOTED"
              ? "Cotação enviada"
              : step === "PENDING_PAYMENT"
                ? "Aguardando pagamento"
                : step === "PAID"
                  ? "Pagamento confirmado"
                  : step === "ORDERED"
                    ? "Pedido encomendado"
                    : step === "IN_TRANSIT"
                      ? "Pedido em trânsito"
                      : step === "ARRIVED"
                        ? "Pedido chegou a nossa sede"
                        : step === "OUT_FOR_DELIVERY"
                          ? "Saiu para entrega"
                          : "Pedido entregue",
      date: dateMap[step],
      state,
      description:
        step === "IN_TRANSIT" && trackingCode
          ? `Código de rastreio ${trackingCode}`
          : undefined,
      actor: step === "PAID" ? payment?.reviewedBy ?? "Admin" : step === "CREATED" ? "Cliente" : "Admin",
      iconColor:
        step === "PAID"
          ? "#15803d"
          : step === "QUOTED"
            ? "#1d4ed8"
            : "#E8431A",
    } satisfies OrderHistoryEntry;
  });

  return timeline;
}

function buildDisplayHistory(
  order: BackendOrderDetail,
  quoteHistory: BackendQuoteHistory[],
  payment: BackendPaymentDetail | null,
  trackingCode: string
): OrderHistoryEntry[] {
  if (order.timelineType === "INTERNAL_COD" && order.trackingDetailSteps?.length) {
    return order.trackingDetailSteps.map((step) => ({
      id: String(step.key ?? step.label ?? "cod-step").toLowerCase(),
      label: step.label ?? "Evento COD",
      date: step.occurredAt ?? null,
      state:
        step.state === "COMPLETED"
          ? "done"
          : step.state === "CURRENT" || step.state === "FAILED"
            ? "current"
            : "future",
      description: step.description ?? undefined,
      actor: step.key === "RECEIVED" ? "Cliente" : "Admin",
      iconColor: step.key === "COD_COLLECTED" ? "#15803d" : "#E8431A",
    }));
  }

  return buildHistory(order, quoteHistory, payment, trackingCode);
}

function mapAuditHistory(items: AuditLogItem[] | null | undefined): OrderHistoryEntry[] {
  return (items ?? []).map((item) => ({
    id: `audit-${item.id}`,
    label: item.action ?? "Evento do pedido",
    date: item.createdAt,
    state: "done",
    description: item.description ?? undefined,
    actor: item.performedByName ?? item.performedByEmail ?? item.performedByCode ?? item.performedByRole ?? "Sistema",
    iconColor: item.action === "NOTIFICATION_FAILED" ? "#C13210" : "#E8431A",
  }));
}

export async function fetchOrderDetailBundle(request: NextRequest, id: string) {
  const [orderResponse, historyResponse, paymentResponse, timelineResponse, trackingResponse, notesResponse] = await Promise.all([
    fetchBackend(request, `/admin/orders/filters?orderId=${encodeURIComponent(id)}&page=0&size=1`),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/quotes`),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/payment`),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/timeline`),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/tracking`),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/notes`),
  ]);

  await Promise.all([
    relayAuthFailure(orderResponse),
    relayAuthFailure(historyResponse),
    relayAuthFailure(paymentResponse),
    relayAuthFailure(timelineResponse),
  ]);

  if (!orderResponse.ok) {
    return { error: jsonError("Não foi possível carregar o pedido.", orderResponse.status) };
  }

  const orderPayload = await parseBackendJson<BackendPage<BackendOrderDetail>>(orderResponse);
  // Pedidos internos não têm histórico de cotação — tratar falha como lista vazia
  const historyPayload = historyResponse.ok
    ? await parseBackendJson<BackendQuoteHistory[]>(historyResponse)
    : [];
  const paymentPayload = paymentResponse.ok
    ? await parseBackendJson<BackendPaymentDetail>(paymentResponse)
    : null;
  const timelinePayload = timelineResponse.ok
    ? await parseBackendJson<AuditLogItem[]>(timelineResponse)
    : [];
  const trackingPayload = trackingResponse.ok
    ? await parseBackendJson<{ trackingCode?: string; carrier?: string; estimatedDelivery?: string; trackingUrl?: string; history?: { id: string; at: string; description: string }[] }>(trackingResponse)
    : null;
  const notesPayload = notesResponse.ok
    ? await parseBackendJson<{ id: string; content: string; author: string; createdAt: string }[]>(notesResponse)
    : [];
  const order = orderPayload?.content?.[0];
  const externalOrder = order ? isExternalOrder(order) : false;

  if (!order) {
    return { error: jsonError("Pedido não encontrado.", 404) };
  }

  const quoteDraftResponse = externalOrder
    ? await fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/quote-draft`)
    : null;
  const quoteDraftPayload = quoteDraftResponse?.ok
    ? await parseBackendJson<import("@/lib/admin/types").ExternalOrderDraft>(quoteDraftResponse)
    : null;

  const [recentOrdersResponse, customerLookupResponse] = await Promise.all([
    fetchBackend(
    request,
    `/admin/orders/filters?customerEmail=${encodeURIComponent(order.customerEmail ?? "")}&page=0&size=4`
    ),
    fetchBackend(
      request,
      `/admin/users?search=${encodeURIComponent(order.customerEmail ?? order.customerFullName ?? "")}`
    ),
  ]);
  await relayAuthFailure(recentOrdersResponse);
  await relayAuthFailure(customerLookupResponse);
  const recentOrdersPayload = recentOrdersResponse.ok
    ? await parseBackendJson<BackendPage<BackendOrderDetail>>(recentOrdersResponse)
    : { content: [] };
  const customerLookupPayload = customerLookupResponse.ok
    ? normalizeCustomerLookupPayload(await parseBackendJson<unknown>(customerLookupResponse))
    : [];

  // Use productPrice from active quote (ZAR) to avoid re-multiplying by exchange rate on re-quote
  const suggestedBaseAmount = externalOrder && order.activeQuote?.productPrice != null
    ? Number(order.activeQuote.productPrice)
    : externalOrder
      ? Number(order.suggestedBaseAmount ?? 0)
      : Number((order.items ?? []).reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0));
  const rawExternalItems = mapExternalItems(order.items, order.externalCartUrl ?? "", suggestedBaseAmount);
  const productIds = Array.from(
    new Set(
      (order.items ?? [])
        .map((item) => item.productId)
        .filter((item): item is number => typeof item === "number" && item > 0)
    )
  );
  const productResponses = await Promise.all(
    productIds.map(async (productId) => {
      const response = await fetchBackend(request, `/admin/products/${productId}`);
      await relayAuthFailure(response);
      if (!response.ok) {
        return null;
      }

      const payload = await parseBackendJson<BackendProductDetail>(response);
      return payload ? [productId, payload] as const : null;
    })
  );
  const productsById = new Map<number, BackendProductDetail>(
    productResponses.filter((entry): entry is readonly [number, BackendProductDetail] => Boolean(entry))
  );
  const externalItems = enrichExternalItems(rawExternalItems, productsById);
  const customerId =
    customerLookupPayload.find((item) => item.id != null)?.id ?? null;
  const trackingMeta = {
    trackingCode: trackingPayload?.trackingCode ?? "",
    carrier: (trackingPayload?.carrier ?? "") as "DHL" | "FEDEX" | "CTT" | "OTHER" | "",
    estimatedDelivery: trackingPayload?.estimatedDelivery ?? "",
    trackingUrl: trackingPayload?.trackingUrl ?? "",
    history: trackingPayload?.history ?? [],
  };
  const trackingCode = trackingMeta.trackingCode;
  const payment: OrderPaymentDetail = {
    id: paymentPayload?.id ?? null,
    amount: Number(paymentPayload?.amount ?? finalOrderTotal(order)),
    method: paymentPayload?.method ?? null,
    provider: paymentPayload?.provider ?? null,
    providerReference: paymentPayload?.providerReference ?? null,
    providerStatus: paymentPayload?.providerStatus ?? null,
    checkoutUrl: paymentPayload?.checkoutUrl ?? null,
    expectedAmount: paymentPayload?.expectedAmount == null ? null : Number(paymentPayload.expectedAmount),
    status: paymentPayload?.status ?? null,
    transactionId: paymentPayload?.transactionId ?? null,
    payerName: paymentPayload?.payerName ?? null,
    payerPhone: paymentPayload?.payerPhone ?? null,
    notes: paymentPayload?.notes ?? null,
    adminNote: paymentPayload?.adminNote ?? null,
    paymentDate: paymentPayload?.paymentDate ?? null,
    submittedAt: paymentPayload?.submittedAt ?? null,
    reviewedAt: paymentPayload?.reviewedAt ?? null,
    reviewedBy: paymentPayload?.reviewedBy ?? null,
    receiptUrl: null,
  };
  const orderNumber = getOrderNumber(order);
  const effectiveOrderStatus = paymentPayload?.status === "FAILED"
    ? "FAILED"
    : order.status ?? "UNDER_REVIEW";
  const detail: ExternalOrderDetail = {
    id: order.id,
    number: orderNumber,
    customerName: order.customerFullName || displayCustomerEmail(order.customerEmail) || "Cliente externo",
    customerEmail: displayCustomerEmail(order.customerEmail) ?? "Email não informado",
    customerPhone: order.primaryPhoneNumber ?? "Sem telefone",
    customerVerified: Boolean(order.customerEmail || order.primaryPhoneNumber),
    type: externalOrder ? "EXTERNAL" : "INTERNAL",
    status: effectiveOrderStatus,
    quoteQueueStatus: order.quoteQueueStatus ?? null,
    operationalStatus: order.operationalStatus ?? order.status ?? "UNDER_REVIEW",
    timelineType: order.timelineType ?? null,
    currentTimelineStep: order.currentTimelineStep ?? null,
    completedTimelineSteps: order.completedTimelineSteps ?? null,
    paymentDisplayStatus: order.paymentDisplayStatus ?? null,
    customerDisplayStatus: order.customerDisplayStatus ?? null,
    actionRequired: Boolean(order.actionRequired?.required && order.actionRequired?.module === "EXTERNAL_QUOTES"),
    nextActionLabel: order.nextActionLabel ?? order.actionRequired?.nextActionLabel ?? null,
    nextActionModule: order.nextActionModule ?? order.actionRequired?.module ?? null,
    allowedActions: order.allowedActions ?? [],
    isArchived: Boolean(order.isArchived ?? order.quoteQueueStatus === "ARCHIVED"),
    deliveryMethod: order.deliveryMethod ?? null,
    paymentMethod: order.paymentMethod ?? paymentPayload?.method ?? null,
    codEnabled: Boolean(order.codEnabled),
    depositRequired: Boolean(order.depositRequired),
    depositAmount: order.depositAmount == null ? null : Number(order.depositAmount),
    remainingAmountOnDelivery: order.remainingAmountOnDelivery == null ? null : Number(order.remainingAmountOnDelivery),
    deliveryPaymentStatus: order.deliveryPaymentStatus ?? null,
    urgentRequest: Boolean(order.urgent),
    externalCartUrl: externalOrder ? order.externalCartUrl ?? "" : "",
    requestInputType: externalOrder ? order.requestInputType ?? null : null,
    productDetails: externalOrder ? order.productDetails ?? "" : "",
    originalRawMessage: externalOrder ? order.originalRawMessage ?? "" : "",
    cleanDescription: externalOrder ? order.cleanDescription ?? order.productDetails ?? "" : "",
    cleanedTitle: externalOrder ? order.cleanedTitle ?? "" : "",
    detectedLinks: externalOrder ? order.detectedLinks ?? [] : [],
    promotionalTextRemoved: externalOrder ? Boolean(order.promotionalTextRemoved) : false,
    requestedQuantity: externalOrder ? Number(order.requestedQuantity ?? 1) : 0,
    requestScreenshotUrl: externalOrder ? order.requestScreenshotUrl ?? "" : "",
    requestScreenshotUrls: externalOrder
      ? order.requestScreenshotUrls?.length
        ? order.requestScreenshotUrls
        : order.requestScreenshotUrl
          ? [order.requestScreenshotUrl]
          : []
      : [],
    needsCustomerCorrection: externalOrder ? Boolean(order.needsCustomerCorrection) : false,
    needsClarification: externalOrder ? Boolean(order.needsClarification) : false,
    customerCorrectionNote: externalOrder ? order.customerCorrectionNote ?? null : null,
    activeClarificationRequest: externalOrder ? order.activeClarificationRequest ?? null : null,
    latestClarificationRequest: externalOrder ? order.latestClarificationRequest ?? null : null,
    customerEditable: externalOrder ? Boolean(order.customerEditable) : false,
    purchaseConfirmedAt: externalOrder ? order.purchaseConfirmedAt ?? null : null,
    purchaseProofUrl: externalOrder ? order.purchaseProofUrl ?? null : null,
    purchaseProofUploadedAt: externalOrder ? order.purchaseProofUploadedAt ?? null : null,
    purchasedByAdminId: externalOrder ? order.purchasedByAdminId ?? null : null,
    supplierPurchaseAmount: externalOrder && order.supplierPurchaseAmount != null ? Number(order.supplierPurchaseAmount) : null,
    supplierOrderReference: externalOrder ? order.supplierOrderReference ?? null : null,
    supplierName: externalOrder ? order.supplierName ?? null : null,
    purchaseNote: externalOrder ? order.purchaseNote ?? null : null,
    sourceStore: externalOrder ? order.sourceStore || "Loja externa" : "Retalho local",
    createdAt: order.orderDate ?? new Date().toISOString(),
    totalAmount: finalOrderTotal(order),
    totalBeforeDiscount: order.totalBeforeDiscount ?? null,
    couponCode: order.couponCode ?? null,
    discountAmount: Number(order.discountAmount ?? 0),
    totalAfterDiscount: order.totalAfterDiscount ?? null,
    suggestedBaseAmount,
    externalItems,
    latestQuoteSentAt: externalOrder ? order.quoteSentAt ?? historyPayload?.[0]?.quotedAt ?? order.activeQuote?.quotedAt ?? null : null,
    quoteSentAt: externalOrder ? order.quoteSentAt ?? null : null,
    quoteTokenExpiresAt: externalOrder ? order.quoteTokenExpiresAt ?? null : null,
    quoteAcceptedAt: externalOrder ? order.quoteAcceptedAt ?? null : null,
    quoteRejectedAt: externalOrder ? order.quoteRejectedAt ?? null : null,
    quoteRejectedReason: externalOrder ? order.quoteRejectedReason ?? null : null,
    quoteDraft: externalOrder ? (quoteDraftPayload ?? (order.activeQuote?.productPrice != null
      ? {
          baseAmount: Number(order.activeQuote.productPrice),
          shippingFee: Number(order.activeQuote.shippingFee ?? 0),
          exchangeRate: Number(order.activeQuote.exchangeRate ?? 1),
          currency: order.activeQuote.currency || "ZAR",
          commissionPercentage: Number(order.activeQuote.commissionPercentage ?? 0),
          returnRiskPercentage: Number(order.activeQuote.returnRiskPercentage ?? 0),
          customsType: order.activeQuote.customsTypeSnapshot === "FIXED" ? "FIXED" : "PERCENT",
          customsValue: Number(order.activeQuote.customsValueSnapshot ?? order.activeQuote.customsPercentSnapshot ?? order.activeQuote.operationalCostPercentage ?? 0),
          operationalCostPercentage: Number(order.activeQuote.operationalCostPercentage ?? 0),
          urgentPercentage: 0,
          urgentAmount: 0,
          totalFinal: 0,
          notes: "",
          validityDate: "",
        }
      : null)) : null,
    recentCustomerOrders: (recentOrdersPayload.content ?? [])
      .filter((item) => item.id !== order.id)
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        number: getOrderNumber(item),
        status: item.id === order.id ? effectiveOrderStatus : item.status ?? "UNDER_REVIEW",
        totalAmount: finalOrderTotal(item),
        createdAt: item.orderDate ?? new Date().toISOString(),
      })),
    customerId,
    city: order.deliveryCity ?? "",
    deliveryAddress: [order.deliveryStreet, order.houseNumber, order.deliveryNeighborhood, order.deliveryCity]
      .filter(Boolean)
      .join(", "),
    deliveryReference: order.deliveryReference ?? "",
    googleMapsLink: order.googleMapsLink ?? "",
    customerNotes: order.customerNotes ?? "",
    itemSubtotal: externalOrder ? Number(order.baseAmount ?? suggestedBaseAmount) : suggestedBaseAmount,
    additionalCosts: (() => {
      if (!externalOrder) {
        return {
          freight: 0,
          customs: 0,
          urgent: 0,
          localDelivery: Number(order.deliveryFee ?? 0),
          commission: 0,
          discount: Number(order.discountAmount ?? 0),
        };
      }
      const commission = Number(order.commissionAmount ?? 0);
      const exchangeRate = Number(order.activeQuote?.exchangeRate ?? 1);
      const saShipping = order.activeQuote?.shippingFee != null
        ? Math.round(Number(order.activeQuote.shippingFee) * exchangeRate * 100) / 100
        : 0;
      const productAmountMzn = order.activeQuote?.productPrice != null
        ? Number(order.activeQuote.productPrice) * exchangeRate
        : Number(order.baseAmount ?? 0);
      const riskAndOperational = order.activeQuote != null
        ? productAmountMzn * (Number(order.activeQuote.returnRiskPercentage ?? 0) + Number(order.activeQuote.operationalCostPercentage ?? 0)) / 100
        : 0;
      return {
        freight: Math.round(saShipping * 100) / 100,
        customs: Math.round(riskAndOperational * 100) / 100,
        urgent: 0,
        localDelivery: 0,
        commission,
        discount: 0,
      };
    })(),
    quoteExchangeRate: externalOrder && order.activeQuote?.exchangeRate != null ? Number(order.activeQuote.exchangeRate) : null,
    quoteCurrency: externalOrder ? order.activeQuote?.currency || null : null,
    trackingCode,
    trackingCarrier: trackingMeta.carrier,
    estimatedDelivery: trackingMeta.estimatedDelivery || null,
    trackingUrl:
      trackingMeta.trackingUrl ||
      (trackingCode ? `https://www.google.com/search?q=${encodeURIComponent(trackingCode)}` : null),
    payment,
    internalNotes: notesPayload ?? [],
  };

  return {
    detail,
    history: [
      ...mapAuditHistory(timelinePayload),
      ...buildDisplayHistory(order, historyPayload ?? [], paymentPayload, trackingCode),
    ],
    initials: getInitials(detail.customerName),
  };
}

function displayCustomerEmail(email: string | null | undefined) {
  const value = typeof email === "string" ? email.trim() : "";
  if (!value || value.toLowerCase().endsWith("@xdigital.local")) return null;
  return value;
}
