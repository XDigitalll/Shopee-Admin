export const RAW_ADMIN_ORDER_STATUSES = [
  "CREATED",
  "UNDER_REVIEW",
  "QUOTED",
  "APPROVED",
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAYMENT_UNDER_REVIEW",
  "PAYMENT_REJECTED",
  "PAYMENT_ON_DELIVERY_PENDING",
  "PAID",
  "READY_FOR_FULFILLMENT",
  "PICKING",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "TO_PURCHASE",
  "ORDERED",
  "PURCHASED",
  "IN_TRANSIT",
  "ARRIVED",
  "OUT_FOR_DELIVERY",
  "AWAITING_DELIVERY_PAYMENT",
  "DELIVERY_FAILED",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
] as const;

export const ORDER_QUEUE_STATUSES = [
  "ALL",
  "ANALYSIS",
  "PAYMENT",
  "EXECUTION",
  "DELIVERY",
  "COMPLETED",
  "CANCELLED",
] as const;

export const CUSTOMER_ORDER_STAGES = [
  "RECEIVED",
  "PRICING",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "INTERNATIONAL_TRANSIT",
  "AT_HQ",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type RawAdminOrderStatus = (typeof RAW_ADMIN_ORDER_STATUSES)[number];
export type OrderQueueStatus = (typeof ORDER_QUEUE_STATUSES)[number];
export type CustomerOrderStage = (typeof CUSTOMER_ORDER_STAGES)[number];

const RAW_STATUS_SET = new Set<string>(RAW_ADMIN_ORDER_STATUSES);
const QUEUE_STATUS_SET = new Set<string>(ORDER_QUEUE_STATUSES);

export function isRawAdminOrderStatus(value: string | null | undefined): value is RawAdminOrderStatus {
  return Boolean(value && RAW_STATUS_SET.has(value));
}

export function isQueueStatus(value: string | null | undefined): value is OrderQueueStatus {
  return Boolean(value && QUEUE_STATUS_SET.has(value));
}

export function resolveUiOrderStatus(
  status: string | null | undefined,
  type: "EXTERNAL" | "INTERNAL" = "INTERNAL"
): RawAdminOrderStatus {
  if (type === "EXTERNAL" && status === "CREATED") {
    return "UNDER_REVIEW";
  }

  if (isRawAdminOrderStatus(status)) {
    return status;
  }

  return "UNDER_REVIEW";
}

export function resolveOrderQueueStatus(status: string | null | undefined): Exclude<OrderQueueStatus, "ALL"> {
  switch (status) {
    case "CREATED":
    case "UNDER_REVIEW":
    case "QUOTED":
      return "ANALYSIS";
    case "APPROVED":
    case "PENDING_PAYMENT":
    case "PAYMENT_SUBMITTED":
    case "PAYMENT_UNDER_REVIEW":
    case "PAYMENT_REJECTED":
    case "PAYMENT_ON_DELIVERY_PENDING":
      return "PAYMENT";
    case "PAID":
    case "READY_FOR_FULFILLMENT":
    case "PICKING":
    case "PREPARING":
    case "TO_PURCHASE":
    case "ORDERED":
    case "PURCHASED":
    case "IN_TRANSIT":
    case "ARRIVED":
      return "EXECUTION";
    case "READY_FOR_DELIVERY":
    case "OUT_FOR_DELIVERY":
    case "AWAITING_DELIVERY_PAYMENT":
    case "DELIVERY_FAILED":
      return "DELIVERY";
    case "DELIVERED":
      return "COMPLETED";
    case "CANCELLED":
    case "FAILED":
      return "CANCELLED";
    default:
      return "ANALYSIS";
  }
}

export function resolveCustomerOrderStage(status: string | null | undefined): CustomerOrderStage {
  switch (status) {
    case "CREATED":
      return "RECEIVED";
    case "UNDER_REVIEW":
    case "QUOTED":
      return "PRICING";
    case "APPROVED":
    case "PENDING_PAYMENT":
    case "PAYMENT_SUBMITTED":
    case "PAYMENT_UNDER_REVIEW":
    case "PAYMENT_REJECTED":
      return "AWAITING_PAYMENT";
    case "PAYMENT_ON_DELIVERY_PENDING":
      return "AWAITING_PAYMENT";
    case "PAID":
    case "READY_FOR_FULFILLMENT":
    case "PICKING":
    case "PREPARING":
      return "CONFIRMED";
    case "TO_PURCHASE":
    case "ORDERED":
    case "PURCHASED":
      return "PROCESSING";
    case "IN_TRANSIT":
      return "INTERNATIONAL_TRANSIT";
    case "ARRIVED":
    case "READY_FOR_DELIVERY":
      return "AT_HQ";
    case "OUT_FOR_DELIVERY":
    case "DELIVERY_FAILED":
    case "AWAITING_DELIVERY_PAYMENT":
      return "ON_THE_WAY";
    case "DELIVERED":
      return "DELIVERED";
    case "CANCELLED":
    case "FAILED":
      return "CANCELLED";
    default:
      return "RECEIVED";
  }
}
