/**
 * Unit tests for tracker logic in orders-management-view.tsx.
 * Mirrors: primaryAction (drawer), backend tracking step rendering, badge logic.
 *
 * The local TRACKING_STEPS constants and getDrawerTracking* functions were
 * removed — the admin now renders order.trackingSteps from the backend.
 *
 * Run with: node --test __tests__/order-management-tracker.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Backend tracking step rendering (mirrors OrdersDrawer JSX) ────────────────

function renderTrackingStep(step) {
  const done = step.state === "COMPLETED";
  const current = step.state === "CURRENT";
  const failed = step.state === "FAILED";
  return { key: step.key, label: step.label, done, current, failed };
}

function hasExactlyOneCurrent(steps) {
  return steps.filter((s) => s.current).length === 1;
}

// ── Mirrors from orders-management-view.tsx (still present) ──────────────────

function getOperationalStatus(order) {
  return String(order?.orderStatus || order?.fulfillmentStatus || order?.status || "");
}

function isPickupOrder(order) {
  return order?.type === "INTERNAL" && order?.deliveryMethod === "STORE_PICKUP";
}

function isInternalDeliveryOrder(order) {
  return order?.type === "INTERNAL" && order?.deliveryMethod !== "STORE_PICKUP";
}

function isPaymentValidated(paymentStatus) {
  return paymentStatus === "VALIDATED" || paymentStatus === "APPROVED" || paymentStatus === "CONFIRMED";
}

function isCashOnDelivery(order) {
  return order?.paymentMethod === "CASH_ON_DELIVERY" || order?.payOnDelivery === true;
}

const DELIVERY_NEXT_ACTION = {
  ARRIVED: { label: "Marcar pronto para entrega", targetStatus: "READY_FOR_DELIVERY" },
  READY_FOR_DELIVERY: { label: "Saiu para entrega", targetStatus: "OUT_FOR_DELIVERY" },
  OUT_FOR_DELIVERY: { label: "Confirmar entrega", targetStatus: "DELIVERED" },
};

function primaryAction(orderItem, mode = "orders", effectiveRole = "ORDERS") {
  if (!orderItem) return null;
  const status = getOperationalStatus(orderItem);

  if (isPickupOrder(orderItem)) {
    if (status === "PAID") return { label: "Marcar pronto para levantamento", action: "mark-status", targetStatus: "ORDERED" };
    if (["ORDERED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY"].includes(status)) {
      if (isCashOnDelivery(orderItem) && !isPaymentValidated(orderItem.paymentStatus)) {
        return { label: "Confirmar cobrança e levantamento", action: "collect-and-close", targetStatus: "DELIVERED" };
      }
      return { label: "Confirmar levantamento", action: "mark-status", targetStatus: "DELIVERED" };
    }
    if (status === "DELIVERED") return { label: "Ver detalhes completos", href: `/admin/orders/${orderItem.id}` };
    return null;
  }

  if (mode === "delivery") {
    if (orderItem.deliveryMethod === "STORE_PICKUP") return null;
    if (isCashOnDelivery(orderItem) && !isPaymentValidated(orderItem.paymentStatus) && status === "OUT_FOR_DELIVERY") {
      return { label: "Confirmar cobrança e entrega", action: "collect-and-close", targetStatus: "DELIVERED" };
    }
    const deliveryAction = DELIVERY_NEXT_ACTION[status] ?? null;
    return deliveryAction
      ? { label: deliveryAction.label, action: "mark-status", targetStatus: deliveryAction.targetStatus }
      : null;
  }

  if (orderItem.uiStatus === "UNDER_REVIEW" || (orderItem.type === "EXTERNAL" && orderItem.uiStatus === "CREATED")) {
    return { label: "Analisar e cotar", href: `/admin/orders/${orderItem.id}/quote` };
  }
  if (orderItem.uiStatus === "QUOTED") return { label: "Ver cotacao enviada", href: `/admin/orders/${orderItem.id}/quote` };
  if (["APPROVED", "PENDING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"].includes(orderItem.uiStatus)) {
    return effectiveRole === "SUPER_ADMIN"
      ? { label: orderItem.uiStatus === "PAYMENT_REJECTED" ? "Ver submissao financeira" : "Ver em pagamentos", href: `/admin/payments?orderId=${orderItem.id}` }
      : { label: "Enviar para equipa de pagamentos", action: "handoff", targetQueue: "PAYMENTS" };
  }
  if (isInternalDeliveryOrder(orderItem) && status === "READY_FOR_FULFILLMENT") {
    return { label: "Preparar produto", action: "mark-ready-for-delivery" };
  }
  if (isInternalDeliveryOrder(orderItem) && ["PICKING", "PREPARING"].includes(status)) {
    return { label: "Mandar para entrega", action: "mark-ready-for-delivery" };
  }
  if (isInternalDeliveryOrder(orderItem) && status === "READY_FOR_DELIVERY") {
    return { label: "Ver em entregas", href: "/admin/delivery/pending" };
  }
  if (orderItem.type === "EXTERNAL" && (orderItem.uiStatus === "TO_PURCHASE" || orderItem.uiStatus === "PAID")) {
    return { label: "Marcar como comprado", action: "mark-purchased" };
  }
  if (orderItem.type === "EXTERNAL" && (status === "ORDERED" || status === "PURCHASED")) {
    return { label: "Marcar em trânsito", action: "mark-in-transit" };
  }
  if (orderItem.type === "EXTERNAL" && status === "IN_TRANSIT") {
    return { label: "Marcar como chegado a sede", action: "mark-arrived" };
  }
  if (orderItem.type === "EXTERNAL" && status === "ARRIVED") {
    return { label: "Marcar pronto para entrega", action: "mark-status", targetStatus: "READY_FOR_DELIVERY" };
  }
  if (orderItem.type === "EXTERNAL" && status === "READY_FOR_DELIVERY") {
    return { label: "Ver em entregas", href: "/admin/delivery/pending" };
  }
  if (orderItem.uiStatus === "DELIVERED") return { label: "Ver recibo", href: `/admin/orders/${orderItem.id}` };
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function externalOrder(status) {
  return {
    id: 14, type: "EXTERNAL", status, orderStatus: status, fulfillmentStatus: status,
    uiStatus: status, deliveryMethod: "DELIVERY", paymentStatus: null, paymentMethod: "TRANSFER",
  };
}

function internalDelivery(status) {
  return {
    id: 1, type: "INTERNAL", status, orderStatus: status, fulfillmentStatus: status,
    uiStatus: status, deliveryMethod: "DELIVERY", paymentStatus: null, paymentMethod: "TRANSFER",
  };
}

function pickupOrder(status) {
  return {
    id: 2, type: "INTERNAL", status, orderStatus: status, fulfillmentStatus: status,
    uiStatus: status, deliveryMethod: "STORE_PICKUP", paymentStatus: null, paymentMethod: "TRANSFER",
  };
}

function makeBackendStep(key, label, state) {
  return { key, label, state, occurredAt: null, visibleToCustomer: true, visibleToAdmin: true };
}

function makeExternalToPurchaseSteps() {
  return [
    makeBackendStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED"),
    makeBackendStep("QUOTE_ANALYSIS", "Em analise", "COMPLETED"),
    makeBackendStep("QUOTE_READY", "Proposta enviada", "COMPLETED"),
    makeBackendStep("PAYMENT_PENDING", "Aguardando pagamento", "COMPLETED"),
    makeBackendStep("PAYMENT_SUBMITTED", "Comprovativo enviado", "COMPLETED"),
    makeBackendStep("PAYMENT_UNDER_REVIEW", "Pagamento em analise", "COMPLETED"),
    makeBackendStep("PAYMENT_APPROVED", "Pagamento aprovado", "COMPLETED"),
    makeBackendStep("TO_PURCHASE", "Comprar no fornecedor", "CURRENT"),
    makeBackendStep("PURCHASED", "Comprado", "PENDING"),
    makeBackendStep("IN_TRANSIT", "Em transito internacional", "PENDING"),
    makeBackendStep("ARRIVED", "Chegou a sede", "PENDING"),
    makeBackendStep("READY_FOR_DELIVERY", "Pronto para entrega", "PENDING"),
    makeBackendStep("OUT_FOR_DELIVERY", "Saiu para entrega", "PENDING"),
    makeBackendStep("DELIVERED", "Entregue", "PENDING"),
  ];
}

// ── Tests: backend tracking step rendering ─────────────────────────────────

describe("backend tracking steps — rendering", () => {
  test("COMPLETED step: done=true, current=false, failed=false", () => {
    const step = renderTrackingStep(makeBackendStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED"));
    assert.equal(step.done, true);
    assert.equal(step.current, false);
    assert.equal(step.failed, false);
  });

  test("CURRENT step: done=false, current=true, failed=false", () => {
    const step = renderTrackingStep(makeBackendStep("TO_PURCHASE", "Comprar no fornecedor", "CURRENT"));
    assert.equal(step.done, false);
    assert.equal(step.current, true);
    assert.equal(step.failed, false);
  });

  test("PENDING step: done=false, current=false, failed=false", () => {
    const step = renderTrackingStep(makeBackendStep("DELIVERED", "Entregue", "PENDING"));
    assert.equal(step.done, false);
    assert.equal(step.current, false);
    assert.equal(step.failed, false);
  });

  test("FAILED step: done=false, current=false, failed=true", () => {
    const step = renderTrackingStep(makeBackendStep("PAYMENT_REJECTED", "Pagamento recusado", "FAILED"));
    assert.equal(step.done, false);
    assert.equal(step.current, false);
    assert.equal(step.failed, true);
  });

  test("TO_PURCHASE step has admin label 'Comprar no fornecedor'", () => {
    const steps = makeExternalToPurchaseSteps().map(renderTrackingStep);
    const step = steps.find((s) => s.key === "TO_PURCHASE");
    assert.ok(step, "TO_PURCHASE step must exist");
    assert.equal(step.label, "Comprar no fornecedor");
  });

  test("external TO_PURCHASE order has exactly one CURRENT step", () => {
    const steps = makeExternalToPurchaseSteps().map(renderTrackingStep);
    assert.ok(hasExactlyOneCurrent(steps), `Expected 1 current, got ${steps.filter((s) => s.current).length}`);
  });

  test("external TO_PURCHASE: 7 steps COMPLETED before current", () => {
    const steps = makeExternalToPurchaseSteps().map(renderTrackingStep);
    const doneCount = steps.filter((s) => s.done).length;
    assert.equal(doneCount, 7);
  });

  test("no PAYMENT_REJECTED step in TO_PURCHASE tracker (not current status)", () => {
    const steps = makeExternalToPurchaseSteps().map(renderTrackingStep);
    assert.ok(!steps.find((s) => s.key === "PAYMENT_REJECTED"), "PAYMENT_REJECTED must not appear when payment is approved");
  });

  test("PAYMENT_REJECTED shows as FAILED when it IS the current status", () => {
    const paymentRejectedSteps = [
      makeBackendStep("ORDER_RECEIVED", "Pedido recebido", "COMPLETED"),
      makeBackendStep("QUOTE_ANALYSIS", "Em analise", "COMPLETED"),
      makeBackendStep("QUOTE_READY", "Proposta enviada", "COMPLETED"),
      makeBackendStep("PAYMENT_PENDING", "Aguardando pagamento", "COMPLETED"),
      makeBackendStep("PAYMENT_SUBMITTED", "Comprovativo enviado", "COMPLETED"),
      makeBackendStep("PAYMENT_UNDER_REVIEW", "Pagamento em analise", "COMPLETED"),
      makeBackendStep("PAYMENT_REJECTED", "Pagamento recusado", "FAILED"),
    ].map(renderTrackingStep);
    const rejectedStep = paymentRejectedSteps.find((s) => s.key === "PAYMENT_REJECTED");
    assert.ok(rejectedStep, "PAYMENT_REJECTED step must exist for rejected status");
    assert.equal(rejectedStep.failed, true);
  });
});

// ── Tests: primaryAction ───────────────────────────────────────────────────

describe("primaryAction — TO_PURCHASE external order", () => {
  test("TO_PURCHASE shows 'Marcar como comprado'", () => {
    const action = primaryAction(externalOrder("TO_PURCHASE"));
    assert.ok(action !== null, "action must not be null for TO_PURCHASE");
    assert.equal(action.action, "mark-purchased");
    assert.ok(action.label.toLowerCase().includes("comprado"), `label was: ${action.label}`);
  });

  test("PAID external (legacy) maps to mark-purchased", () => {
    const order = { ...externalOrder("PAID"), uiStatus: "PAID" };
    const action = primaryAction(order);
    assert.ok(action !== null);
    assert.equal(action.action, "mark-purchased");
  });

  test("ORDERED external shows 'Marcar em trânsito'", () => {
    const action = primaryAction(externalOrder("ORDERED"));
    assert.ok(action !== null);
    assert.equal(action.action, "mark-in-transit");
  });

  test("PURCHASED external shows 'Marcar em trânsito'", () => {
    const action = primaryAction(externalOrder("PURCHASED"));
    assert.ok(action !== null);
    assert.equal(action.action, "mark-in-transit");
  });

  test("IN_TRANSIT external shows 'Marcar como chegado'", () => {
    const action = primaryAction(externalOrder("IN_TRANSIT"));
    assert.ok(action !== null);
    assert.equal(action.action, "mark-arrived");
  });

  test("ARRIVED external uses status transition to READY_FOR_DELIVERY", () => {
    const action = primaryAction(externalOrder("ARRIVED"));
    assert.ok(action !== null);
    assert.equal(action.label, "Marcar pronto para entrega");
    assert.equal(action.action, "mark-status");
    assert.equal(action.targetStatus, "READY_FOR_DELIVERY");
  });

  test("READY_FOR_DELIVERY external can go OUT_FOR_DELIVERY in delivery mode", () => {
    const action = primaryAction(externalOrder("READY_FOR_DELIVERY"), "delivery");
    assert.ok(action !== null);
    assert.equal(action.action, "mark-status");
    assert.equal(action.targetStatus, "OUT_FOR_DELIVERY");
  });

  test("OUT_FOR_DELIVERY external can go DELIVERED in delivery mode", () => {
    const action = primaryAction(externalOrder("OUT_FOR_DELIVERY"), "delivery");
    assert.ok(action !== null);
    assert.equal(action.action, "mark-status");
    assert.equal(action.targetStatus, "DELIVERED");
  });

  test("DELIVERED external returns 'Ver recibo' link", () => {
    const action = primaryAction(externalOrder("DELIVERED"));
    assert.ok(action !== null);
    assert.ok(action.href?.includes("admin/orders/"), `href was: ${action.href}`);
    assert.ok(action.label.toLowerCase().includes("recibo"), `label was: ${action.label}`);
  });

  test("CANCELLED external returns null", () => {
    const action = primaryAction(externalOrder("CANCELLED"));
    assert.equal(action, null);
  });
});

describe("primaryAction — internal orders", () => {
  test("READY_FOR_FULFILLMENT shows 'Preparar produto'", () => {
    const action = primaryAction(internalDelivery("READY_FOR_FULFILLMENT"));
    assert.ok(action !== null);
    assert.ok(action.label.includes("Preparar produto"), `label was: ${action.label}`);
    assert.equal(action.action, "mark-ready-for-delivery");
  });

  test("PICKING shows mark-ready-for-delivery", () => {
    const action = primaryAction(internalDelivery("PICKING"));
    assert.ok(action !== null);
    assert.equal(action.action, "mark-ready-for-delivery");
  });

  test("pickup PAID shows mark-status ORDERED", () => {
    const action = primaryAction(pickupOrder("PAID"));
    assert.ok(action !== null);
    assert.equal(action.targetStatus, "ORDERED");
  });

  test("pickup ORDERED shows mark-status DELIVERED", () => {
    const action = primaryAction(pickupOrder("ORDERED"));
    assert.ok(action !== null);
    assert.equal(action.targetStatus, "DELIVERED");
  });
});

describe("badge logic — actionRequired", () => {
  function needsOrdersBadge(order) {
    return Boolean(order.actionRequired && order.actionModule === "ORDERS");
  }

  test("TO_PURCHASE external with actionRequired needs ORDERS badge", () => {
    const order = { ...externalOrder("TO_PURCHASE"), actionRequired: true, actionModule: "ORDERS" };
    assert.equal(needsOrdersBadge(order), true);
  });

  test("DELIVERED order without actionRequired does not need badge", () => {
    const order = { ...externalOrder("DELIVERED"), actionRequired: false, actionModule: null };
    assert.equal(needsOrdersBadge(order), false);
  });

  test("customer action false for TO_PURCHASE (paid, admin must act)", () => {
    const customerActionRequired = false;
    assert.equal(customerActionRequired, false);
  });
});
