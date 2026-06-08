import type {
  AdminOrderListItem,
  AdminPaymentListItem,
  AdminQuoteDetail,
  AdminQuoteListItem,
  DeliveryActiveOrder,
  DeliveryPendingOrder,
  OrderPriority,
} from "@/lib/admin/types";

export type OperationalContext = "ORDERS" | "QUOTES" | "PAYMENTS" | "DELIVERY";

type QueueOrder = {
  status?: string | null;
  uiStatus?: string | null;
  queueStatus?: string | null;
  paymentStatus?: string | null;
  type?: string | null;
  actionRequired?: boolean | null;
};

const PRIORITY_WEIGHT: Record<OrderPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

const CLOSED_STATUSES = new Set(["DELIVERED", "CANCELLED", "FAILED", "COMPLETED"]);
const ORDERS_ACTION_STATUSES = new Set(["CREATED", "UNDER_REVIEW", "QUOTED", "APPROVED"]);
const DELIVERY_ACTION_STATUSES = new Set(["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"]);
const PAYMENT_ACTION_STATUSES = new Set(["PENDING", "PENDING_REVIEW", "SUBMITTED", "FAILED"]);
const QUOTE_ACTION_STATUSES = new Set(["UNDER_REVIEW", "DRAFT", "REJECTED", "NEEDS_REVIEW"]);

function normalized(value: unknown) {
  return String(value ?? "").toUpperCase();
}

function timestamp(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function quoteCustomerResponded(item: {
  clarificationStatus?: "PENDING" | "ANSWERED" | "CANCELLED" | null;
  clarificationAdminSeenAt?: string | null;
}) {
  return item.clarificationStatus === "ANSWERED" && item.clarificationAdminSeenAt == null;
}

export function isActionRequired(order: AdminOrderListItem, context: OperationalContext): boolean;
export function isActionRequired(payment: AdminPaymentListItem, context: "PAYMENTS"): boolean;
export function isActionRequired(quote: AdminQuoteListItem | AdminQuoteDetail, context: "QUOTES"): boolean;
export function isActionRequired(
  item: AdminOrderListItem | AdminPaymentListItem | AdminQuoteListItem | AdminQuoteDetail,
  context: OperationalContext,
) {
  if (context === "PAYMENTS") {
    const payment = item as Partial<AdminPaymentListItem & AdminOrderListItem>;
    if ("receiptSubmitted" in payment) {
      return PAYMENT_ACTION_STATUSES.has(normalized(payment.status)) && Boolean(payment.receiptSubmitted || payment.method === "CASH_ON_DELIVERY");
    }
    return normalized(payment.status) === "PENDING_PAYMENT" || PAYMENT_ACTION_STATUSES.has(normalized(payment.paymentStatus));
  }

  if (context === "QUOTES") {
    const quote = item as AdminQuoteListItem | AdminQuoteDetail | AdminOrderListItem;
    if (typeof quote.actionRequired === "boolean") {
      return quote.actionRequired;
    }
    return QUOTE_ACTION_STATUSES.has(normalized(quote.status)) || QUOTE_ACTION_STATUSES.has(normalized((quote as AdminOrderListItem).uiStatus));
  }

  const order = item as QueueOrder;
  if (typeof order.actionRequired === "boolean") {
    return order.actionRequired;
  }
  const status = normalized(order.status);
  const uiStatus = normalized(order.uiStatus || order.status);
  const queueStatus = normalized(order.queueStatus);

  if (CLOSED_STATUSES.has(status) || CLOSED_STATUSES.has(queueStatus)) {
    return false;
  }

  if (context === "DELIVERY") {
    return DELIVERY_ACTION_STATUSES.has(status);
  }

  return (
    ORDERS_ACTION_STATUSES.has(uiStatus) ||
    queueStatus === "ANALYSIS" ||
    (queueStatus === "EXECUTION" && ["PAID"].includes(status))
  );
}

export function getActionSortWeight(
  item: AdminOrderListItem | AdminPaymentListItem | AdminQuoteListItem | AdminQuoteDetail,
  context: OperationalContext,
) {
  return isActionRequired(item as AdminOrderListItem, context) ? 0 : 1;
}

export function sortOperationalQueue<T extends AdminOrderListItem>(orders: T[], context: OperationalContext): T[];
export function sortOperationalQueue<T extends AdminPaymentListItem>(payments: T[], context: "PAYMENTS"): T[];
export function sortOperationalQueue<T extends AdminQuoteListItem>(quotes: T[], context: "QUOTES", direction?: "ASC" | "DESC"): T[];
export function sortOperationalQueue<
  T extends AdminOrderListItem | AdminPaymentListItem | AdminQuoteListItem
>(items: T[], context: OperationalContext, direction: "ASC" | "DESC" = "ASC") {
  return [...items].sort((left, right) => {
    const actionDelta = getActionSortWeight(left, context) - getActionSortWeight(right, context);
    if (actionDelta !== 0) return actionDelta;

    if (context === "ORDERS" || context === "DELIVERY") {
      const leftOrder = left as AdminOrderListItem;
      const rightOrder = right as AdminOrderListItem;
      const priorityDelta = PRIORITY_WEIGHT[leftOrder.priority] - PRIORITY_WEIGHT[rightOrder.priority];
      if (priorityDelta !== 0) return priorityDelta;
    }

    if (context === "QUOTES") {
      const leftQuote = left as AdminQuoteListItem;
      const rightQuote = right as AdminQuoteListItem;
      const customerResponseDelta = Number(quoteCustomerResponded(rightQuote)) - Number(quoteCustomerResponded(leftQuote));
      if (customerResponseDelta !== 0) return customerResponseDelta;

      const urgentDelta = Number(rightQuote.urgent) - Number(leftQuote.urgent);
      if (urgentDelta !== 0) return urgentDelta;
    }

    const dateDelta = timestamp((left as { createdAt?: string }).createdAt) - timestamp((right as { createdAt?: string }).createdAt);
    return direction === "ASC" ? dateDelta : -dateDelta;
  });
}

export function isDeliveryActionRequired(order: DeliveryPendingOrder | DeliveryActiveOrder) {
  const status = normalized(order.status);

  if (!DELIVERY_ACTION_STATUSES.has(status)) {
    return false;
  }

  if ("assignedDriverId" in order) {
    return !order.deliveryFee || !order.assignedDriverId || status === "ORDERED" || status === "ARRIVED";
  }

  return status === "ORDERED" || status === "OUT_FOR_DELIVERY" || status === "IN_TRANSIT";
}
