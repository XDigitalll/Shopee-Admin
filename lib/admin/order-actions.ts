import { canPerform } from "@/lib/admin/permissions";
import type { AdminRole } from "@/lib/admin/roles";

type OrderActionSubject =
  | AdminRole
  | null
  | undefined
  | {
      role?: unknown;
      roles?: unknown;
    };

type OrderLike = {
  id: number;
  type?: "EXTERNAL" | "INTERNAL" | string | null;
  status?: string | null;
  uiStatus?: string | null;
  orderStatus?: string | null;
  fulfillmentStatus?: string | null;
  deliveryMethod?: "DELIVERY" | "STORE_PICKUP" | string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  allowedActions?: string[];
};

export type AdminOrderAction =
  | { label: string; href: string; key?: string }
  | {
      label: string;
      key?: string;
      action:
        | "focus-tracking"
        | "collect-and-close"
        | "collect-and-deliver"
        | "cancel-order"
        | "mark-status"
        | "mark-ready-for-delivery"
        | "mark-purchased"
        | "mark-in-transit"
        | "mark-arrived"
        | "validate-payment"
        | "handoff"
        | "purchase-proof";
      targetStatus?: "ORDERED" | "IN_TRANSIT" | "ARRIVED" | "READY_FOR_DELIVERY" | "OUT_FOR_DELIVERY" | "DELIVERED";
      targetQueue?: "PAYMENTS" | "QUOTES" | "DELIVERY" | "EXECUTION" | "SUPPORT";
    };

type OrderActionOptions = {
  surface: "list" | "detail";
  mode?: "orders" | "delivery";
  usePurchaseProof?: boolean;
};

const TERMINAL_STATUSES = new Set(["DELIVERED", "CANCELLED", "FAILED"]);
const PAYMENT_STATUSES = new Set(["APPROVED", "PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"]);

function canManageOrders(subject: OrderActionSubject) {
  return canPerform(subject, ["ORDER_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

function canManageDelivery(subject: OrderActionSubject) {
  return canPerform(subject, ["DELIVERY_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

function canCompleteDelivery(subject: OrderActionSubject) {
  return canPerform(subject, ["DELIVERY_DRIVER", "DELIVERY_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

function canManageFinance(subject: OrderActionSubject) {
  return canPerform(subject, ["FINANCE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
}

function canCancelOrders(subject: OrderActionSubject) {
  return canPerform(subject, ["ORDER_MANAGER", "CUSTOMER_SUPPORT", "ADMIN", "SUPER_ADMIN"]);
}

function getStatus(order: OrderLike) {
  return String(order.orderStatus || order.fulfillmentStatus || order.status || order.uiStatus || "");
}

function getUiStatus(order: OrderLike) {
  return String(order.uiStatus || order.status || "");
}

function hasAllowedAction(order: OrderLike, action: string) {
  return Boolean(order.allowedActions?.includes(action));
}

function isCashOnDelivery(order: OrderLike) {
  return order.paymentMethod === "CASH_ON_DELIVERY";
}

function isPaymentValidated(order: OrderLike) {
  return String(order.paymentStatus ?? "") === "SUCCESS";
}

function isPickupOrder(order: OrderLike) {
  return order.type === "INTERNAL" && order.deliveryMethod === "STORE_PICKUP";
}

function isInternalDeliveryOrder(order: OrderLike) {
  return order.type === "INTERNAL" && order.deliveryMethod !== "STORE_PICKUP";
}

function paymentQueueForOrder(status: string) {
  if (status === "PAYMENT_UNDER_REVIEW") return "UNDER_REVIEW";
  if (status === "PAYMENT_REJECTED") return "REJECTED";
  if (status === "PAYMENT_SUBMITTED") return "SUBMITTED";
  return "AWAITING_SUBMISSION";
}

function paymentAction(order: OrderLike, subject: OrderActionSubject): AdminOrderAction {
  const uiStatus = getUiStatus(order);
  if (canManageFinance(subject)) {
    return {
      key: "view-payment",
      label: uiStatus === "PAYMENT_REJECTED" ? "Ver submissao financeira" : "Ver em pagamentos",
      href: `/admin/payments?orderId=${order.id}&queue=${paymentQueueForOrder(uiStatus)}`,
    };
  }

  return {
    key: "handoff-payments",
    label: "Enviar para equipa de pagamentos",
    action: "handoff",
    targetQueue: "PAYMENTS",
  };
}

export function getAvailableOrderActions(
  order: OrderLike | null | undefined,
  currentUser: OrderActionSubject,
  options: OrderActionOptions
): AdminOrderAction[] {
  if (!order) return [];

  const status = getStatus(order);
  const uiStatus = getUiStatus(order);
  const actions: AdminOrderAction[] = [];
  const pickupOrder = isPickupOrder(order);
  const internalDeliveryOrder = isInternalDeliveryOrder(order);
  const detailSurface = options.surface === "detail";

  if (TERMINAL_STATUSES.has(status) || TERMINAL_STATUSES.has(uiStatus)) {
    return [];
  }

  if (pickupOrder) {
    if (hasAllowedAction(order, "MARK_READY_FOR_PICKUP") && canManageOrders(currentUser)) {
      actions.push({ key: "ready-for-pickup", label: "Marcar pronto para levantamento", action: "mark-ready-for-delivery" });
    }
    if (hasAllowedAction(order, "CONFIRM_PICKUP") && canCompleteDelivery(currentUser)) {
      actions.push({
        key: "confirm-pickup",
        label: isCashOnDelivery(order) && !isPaymentValidated(order) ? "Confirmar cobranca e levantamento" : "Confirmar levantamento",
        action: isCashOnDelivery(order) && !isPaymentValidated(order) ? "collect-and-close" : "mark-status",
        targetStatus: "DELIVERED",
      });
    }
    return addCancelAction(actions, order, currentUser, detailSurface);
  }

  if (options.mode !== "delivery") {
    if ((status === "UNDER_REVIEW" || (order.type === "EXTERNAL" && status === "CREATED")) && canManageOrders(currentUser)) {
      actions.push({ key: "quote", label: "Analisar e cotar", href: `/admin/orders/${order.id}/quote` });
    }

    if (status === "QUOTED") {
      actions.push({ key: "view-quote", label: "Ver cotacao enviada", href: `/admin/orders/${order.id}/quote` });
    }

    if (PAYMENT_STATUSES.has(uiStatus) || PAYMENT_STATUSES.has(status)) {
      actions.push(paymentAction(order, currentUser));
    }
  }

  if (internalDeliveryOrder) {
    if (["PAID", "PAYMENT_ON_DELIVERY_PENDING", "READY_FOR_FULFILLMENT"].includes(status) && canManageOrders(currentUser)) {
      actions.push({ key: "prepare-internal", label: "Preparar produto", action: "mark-ready-for-delivery" });
    }
    if (["PICKING", "PREPARING"].includes(status) && canManageOrders(currentUser)) {
      actions.push({ key: "ready-internal-delivery", label: "Marcar pronto para entrega", action: "mark-ready-for-delivery" });
    }
    if (status === "READY_FOR_DELIVERY" && canManageDelivery(currentUser)) {
      actions.push({ key: "send-internal-delivery", label: "Mandar para entrega", action: "mark-status", targetStatus: "OUT_FOR_DELIVERY" });
    }
    if (status === "OUT_FOR_DELIVERY" && canCompleteDelivery(currentUser)) {
      actions.push({
        key: "deliver-internal",
        label: isCashOnDelivery(order) && !isPaymentValidated(order) ? "Confirmar cobranca e entrega" : "Confirmar entrega",
        action: isCashOnDelivery(order) && !isPaymentValidated(order) ? "collect-and-close" : "mark-status",
        targetStatus: "DELIVERED",
      });
    }
    return addCancelAction(actions, order, currentUser, detailSurface);
  }

  if (order.type === "EXTERNAL") {
    if (["PAID", "TO_PURCHASE"].includes(status) || ["PAID", "TO_PURCHASE"].includes(uiStatus)) {
      if (canManageOrders(currentUser)) {
        actions.push({
          key: "purchase-external",
          label: detailSurface || options.usePurchaseProof ? "Enviar comprovativo de compra" : "Marcar como comprado",
          action: detailSurface || options.usePurchaseProof ? "purchase-proof" : "mark-purchased",
        });
      }
    }
    if (["ORDERED", "PURCHASED"].includes(status) && canManageOrders(currentUser)) {
      actions.push({ key: "external-in-transit", label: "Marcar em transito", action: options.surface === "list" ? "mark-in-transit" : "mark-status", targetStatus: "IN_TRANSIT" });
    }
    if (status === "IN_TRANSIT" && canManageOrders(currentUser)) {
      actions.push({ key: "external-arrived", label: "Marcar como chegado a sede", action: options.surface === "list" ? "mark-arrived" : "mark-status", targetStatus: "ARRIVED" });
    }
    if (status === "ARRIVED" && canManageOrders(currentUser)) {
      actions.push({ key: "external-ready-delivery", label: "Marcar pronto para entrega", action: "mark-status", targetStatus: "READY_FOR_DELIVERY" });
    }
    if (status === "READY_FOR_DELIVERY" && canManageDelivery(currentUser)) {
      actions.push({ key: "send-external-delivery", label: "Mandar para entrega", action: "mark-status", targetStatus: "OUT_FOR_DELIVERY" });
    }
    if (status === "OUT_FOR_DELIVERY" && canCompleteDelivery(currentUser)) {
      actions.push({ key: "deliver-external", label: "Confirmar entrega", action: "mark-status", targetStatus: "DELIVERED" });
    }
  }

  return addCancelAction(actions, order, currentUser, detailSurface);
}

export function getPrimaryOrderAction(
  order: OrderLike | null | undefined,
  currentUser: OrderActionSubject,
  options: OrderActionOptions
) {
  return getAvailableOrderActions(order, currentUser, options).find((action) => "href" in action || action.action !== "cancel-order") ?? null;
}

export function getOrderActionHint(order: OrderLike | null | undefined) {
  if (!order) return null;
  const status = getStatus(order);
  if (status === "ARRIVED" && order.deliveryMethod !== "STORE_PICKUP") {
    return "Este pedido ainda precisa ser marcado como pronto para entrega.";
  }
  return null;
}

function addCancelAction(
  actions: AdminOrderAction[],
  order: OrderLike,
  currentUser: OrderActionSubject,
  includeCancel: boolean
) {
  const status = getStatus(order);
  if (includeCancel && !TERMINAL_STATUSES.has(status) && canCancelOrders(currentUser)) {
    actions.push({ key: "cancel-order", label: "Cancelar pedido", action: "cancel-order" });
  }
  return actions;
}
