import { NextRequest } from "next/server";

import {
  fetchBackend,
  jsonError,
  parseBackendJson,
  relayAuthFailure,
} from "@/app/api/admin/_utils";
import { getOrderNotes, getTrackingMeta } from "@/lib/admin/order-meta-store";
import { getQuoteDraft } from "@/lib/admin/quote-drafts";
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
  urgent?: boolean | null;
  status?: string;
  externalCartUrl?: string | null;
  requestInputType?: "LINK" | "DESCRIPTION" | null;
  productDetails?: string | null;
  requestedQuantity?: number | null;
  requestScreenshotUrl?: string | null;
  sourceStore?: string | null;
  orderDate?: string | null;
  totalAmount?: number | null;
  suggestedBaseAmount?: number | null;
  baseAmount?: number | null;
  commissionAmount?: number | null;
  deliveryFee?: number | null;
  activeQuote?: {
    quotedAt?: string | null;
    finalAmountMzn?: number | null;
    productPrice?: number | null;
    shippingFee?: number | null;
    exchangeRate?: number | null;
    currency?: string | null;
    commissionPercentage?: number | null;
    returnRiskPercentage?: number | null;
    operationalCostPercentage?: number | null;
    urgentPercentage?: number | null;
    urgentAmount?: number | null;
  } | null;
  items?: BackendOrderItem[] | null;
};

function getOrderNumber(order: Pick<BackendOrderDetail, "id" | "code" | "orderCode">) {
  return order.code || order.orderCode || `#${order.id}`;
}

type BackendPaymentDetail = {
  id?: number | null;
  amount?: number | null;
  method?: string | null;
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
      variantLabel: pickVariantLabel(product),
      categoryName: product.category?.name ?? product.subCategory ?? null,
      stockLabel:
        typeof product.stock === "number"
          ? `${product.stock} em stock`
          : null,
      details:
        [
          pickVariantLabel(product),
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
  const [orderResponse, historyResponse, paymentResponse, timelineResponse] = await Promise.all([
    fetchBackend(request, `/admin/orders/filters?orderId=${encodeURIComponent(id)}&page=0&size=1`),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/quotes`),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/payment`),
    fetchBackend(request, `/admin/orders/${encodeURIComponent(id)}/timeline`),
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
  const order = orderPayload?.content?.[0];

  if (!order) {
    return { error: jsonError("Pedido não encontrado.", 404) };
  }

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
  const suggestedBaseAmount = order.activeQuote?.productPrice != null
    ? Number(order.activeQuote.productPrice)
    : Number(order.suggestedBaseAmount ?? 0);
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
  const trackingMeta = getTrackingMeta(id);
  const trackingCode = trackingMeta.trackingCode;
  const payment: OrderPaymentDetail = {
    id: paymentPayload?.id ?? null,
    amount: Number(paymentPayload?.amount ?? order.totalAmount ?? 0),
    method: paymentPayload?.method ?? null,
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
    customerName: order.customerFullName || order.customerEmail || "Cliente externo",
    customerEmail: order.customerEmail ?? "",
    customerPhone: order.primaryPhoneNumber ?? "Sem telefone",
    customerVerified: Boolean(order.customerEmail || order.primaryPhoneNumber),
    type: order.type ?? "EXTERNAL",
    status: effectiveOrderStatus,
    deliveryMethod: order.deliveryMethod ?? null,
    urgentRequest: Boolean(order.urgent),
    externalCartUrl: order.externalCartUrl ?? "",
    requestInputType: order.requestInputType ?? null,
    productDetails: order.productDetails ?? "",
    requestedQuantity: Number(order.requestedQuantity ?? 1),
    requestScreenshotUrl: order.requestScreenshotUrl ?? "",
    sourceStore: order.sourceStore || "Loja externa",
    createdAt: order.orderDate ?? new Date().toISOString(),
    totalAmount: Number(order.totalAmount ?? 0),
    suggestedBaseAmount,
    externalItems,
    latestQuoteSentAt: historyPayload?.[0]?.quotedAt ?? order.activeQuote?.quotedAt ?? null,
    quoteDraft: getQuoteDraft(id) ?? (order.activeQuote?.productPrice != null
      ? {
          baseAmount: Number(order.activeQuote.productPrice),
          shippingFee: Number(order.activeQuote.shippingFee ?? 0),
          exchangeRate: Number(order.activeQuote.exchangeRate ?? 1),
          currency: order.activeQuote.currency || "ZAR",
          commissionPercentage: Number(order.activeQuote.commissionPercentage ?? 0),
          returnRiskPercentage: Number(order.activeQuote.returnRiskPercentage ?? 0),
          operationalCostPercentage: Number(order.activeQuote.operationalCostPercentage ?? 0),
          urgentPercentage: 0,
          urgentAmount: 0,
          totalFinal: 0,
          notes: "",
          validityDate: "",
        }
      : null),
    recentCustomerOrders: (recentOrdersPayload.content ?? [])
      .filter((item) => item.id !== order.id)
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        number: getOrderNumber(item),
        status: item.id === order.id ? effectiveOrderStatus : item.status ?? "UNDER_REVIEW",
        totalAmount: Number(item.totalAmount ?? 0),
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
    itemSubtotal: Number(order.baseAmount ?? suggestedBaseAmount),
    additionalCosts: (() => {
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
    quoteExchangeRate: order.activeQuote?.exchangeRate != null ? Number(order.activeQuote.exchangeRate) : null,
    quoteCurrency: order.activeQuote?.currency || null,
    trackingCode,
    trackingCarrier: trackingMeta.carrier,
    estimatedDelivery: trackingMeta.estimatedDelivery || null,
    trackingUrl:
      trackingMeta.trackingUrl ||
      (trackingCode ? `https://www.google.com/search?q=${encodeURIComponent(trackingCode)}` : null),
    payment,
    internalNotes: getOrderNotes(id),
  };

  return {
    detail,
    history: [
      ...mapAuditHistory(timelinePayload),
      ...buildHistory(order, historyPayload ?? [], paymentPayload, trackingCode),
    ],
    initials: getInitials(detail.customerName),
  };
}
