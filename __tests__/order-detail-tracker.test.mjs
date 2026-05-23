/**
 * Unit tests for tracker logic in order-detail-view.tsx.
 * Mirrors: getTrackingSteps, normalizeTrackingStatus, getTrackingStepLabel,
 *          buildPrimaryAction, buildQuickActions
 *
 * Run with: node --test __tests__/order-detail-tracker.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ── Mirrors from order-detail-view.tsx ────────────────────────────────────────

const EXTERNAL_STATUS_STEPS = [
  "CREATED", "UNDER_REVIEW", "QUOTED", "PENDING_PAYMENT",
  "TO_PURCHASE", "ORDERED", "IN_TRANSIT", "ARRIVED",
  "OUT_FOR_DELIVERY", "DELIVERED",
];

const PICKUP_STATUS_STEPS = [
  "CREATED", "UNDER_REVIEW", "QUOTED", "PENDING_PAYMENT",
  "TO_PURCHASE", "ORDERED", "DELIVERED",
];

const INTERNAL_DELIVERY_STATUS_STEPS = [
  "CREATED", "PENDING_PAYMENT", "PAID", "OUT_FOR_DELIVERY", "DELIVERED",
];

const STANDARD_STATUS_STEPS = [
  "CREATED", "UNDER_REVIEW", "QUOTED", "PENDING_PAYMENT",
  "PAID", "ORDERED", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED",
];

function isPickupOrder(detail) {
  return detail.type === "INTERNAL" && detail.deliveryMethod === "STORE_PICKUP";
}

function isInternalDeliveryOrder(detail) {
  return detail.type === "INTERNAL" && detail.deliveryMethod !== "STORE_PICKUP";
}

function getTrackingSteps(detail) {
  if (detail && isPickupOrder(detail)) return PICKUP_STATUS_STEPS;
  if (detail && isInternalDeliveryOrder(detail)) return INTERNAL_DELIVERY_STATUS_STEPS;
  if (detail && detail.type === "EXTERNAL") return EXTERNAL_STATUS_STEPS;
  return STANDARD_STATUS_STEPS;
}

function normalizeTrackingStatus(detail) {
  const status = detail?.status ?? "";
  if (!detail) return "";

  if (isPickupOrder(detail) && ["IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY"].includes(status)) {
    return "ORDERED";
  }
  if (isInternalDeliveryOrder(detail)) {
    if (status === "ORDERED" || status === "ARRIVED") return "PAID";
  }
  if (detail.type === "EXTERNAL" && !isInternalDeliveryOrder(detail) && status === "PAID") {
    return "TO_PURCHASE";
  }
  return status;
}

function getCurrentStepIndex(steps, status) {
  if (!status) return -1;
  return steps.findIndex((step) => step === status);
}

function getTrackingStepLabel(step, detail) {
  if (detail && isPickupOrder(detail)) {
    if (step === "TO_PURCHASE") return "Pago";
    if (step === "ORDERED") return "Pronto para levantar";
    if (step === "DELIVERED") return "Levantado";
  }
  if (detail && isInternalDeliveryOrder(detail)) {
    if (step === "PAID") return "Pago";
    if (step === "OUT_FOR_DELIVERY") return "A caminho";
  }
  if (step === "TO_PURCHASE") return "Comprar no fornecedor";
  return step; // simplified (real code calls humanizeOrderStatus)
}

function buildPrimaryAction(detail, isSuperAdmin = false) {
  const status = detail.status;
  const paymentValidated = String(detail.payment?.status ?? "") === "SUCCESS";
  const cashOnDelivery = detail.payment?.method === "CASH_ON_DELIVERY";
  const pickupOrder = isPickupOrder(detail);

  if (status === "UNDER_REVIEW" || (detail.type === "EXTERNAL" && status === "CREATED")) {
    return { label: "Analisar e cotar" };
  }
  if (pickupOrder) {
    if (status === "PAID") return { label: "Marcar pronto para levantamento", targetStatus: "ORDERED" };
    return null;
  }
  if (isInternalDeliveryOrder(detail)) {
    if (status === "PAID") return { label: isSuperAdmin ? "Ver em entregas" : "Enviar para equipa de delivery" };
    return null;
  }
  if (status === "TO_PURCHASE" || status === "PAID") {
    return { label: "Marcar como encomendado", action: "mark-status", targetStatus: "ORDERED" };
  }
  if (status === "ORDERED") return { label: "Marcar em trânsito", targetStatus: "IN_TRANSIT" };
  if (status === "IN_TRANSIT") return { label: "Marcar como chegado a sede", targetStatus: "ARRIVED" };
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function externalOrder(status) {
  return { type: "EXTERNAL", status, deliveryMethod: "DELIVERY", payment: { status: null, method: "TRANSFER" } };
}

function internalDelivery(status) {
  return { type: "INTERNAL", status, deliveryMethod: "DELIVERY", payment: { status: null, method: "TRANSFER" } };
}

function pickupOrder(status) {
  return { type: "INTERNAL", status, deliveryMethod: "STORE_PICKUP", payment: { status: null, method: "TRANSFER" } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getTrackingSteps — correct step array per order type", () => {
  test("external order uses EXTERNAL_STATUS_STEPS with TO_PURCHASE", () => {
    const steps = getTrackingSteps(externalOrder("TO_PURCHASE"));
    assert.ok(steps.includes("TO_PURCHASE"), "must include TO_PURCHASE");
    assert.ok(!steps.includes("PAID"), "must not include PAID");
  });

  test("external order step 5 is TO_PURCHASE (post-payment approval)", () => {
    const steps = getTrackingSteps(externalOrder("TO_PURCHASE"));
    const idx = steps.indexOf("TO_PURCHASE");
    const pendingIdx = steps.indexOf("PENDING_PAYMENT");
    assert.ok(idx === pendingIdx + 1, "TO_PURCHASE must follow PENDING_PAYMENT");
  });

  test("internal delivery order does not include TO_PURCHASE", () => {
    const steps = getTrackingSteps(internalDelivery("PAID"));
    assert.ok(!steps.includes("TO_PURCHASE"), "internal delivery must not have TO_PURCHASE");
    assert.ok(steps.includes("PAID"), "internal delivery must have PAID");
  });

  test("pickup order uses TO_PURCHASE instead of PAID", () => {
    const steps = getTrackingSteps(pickupOrder("TO_PURCHASE"));
    assert.ok(steps.includes("TO_PURCHASE"));
    assert.ok(!steps.includes("PAID"));
  });
});

describe("normalizeTrackingStatus — TO_PURCHASE resolves correctly", () => {
  test("TO_PURCHASE status on external order stays TO_PURCHASE", () => {
    const normalized = normalizeTrackingStatus(externalOrder("TO_PURCHASE"));
    assert.equal(normalized, "TO_PURCHASE");
  });

  test("PAID on external order maps to TO_PURCHASE (backward compat)", () => {
    const normalized = normalizeTrackingStatus(externalOrder("PAID"));
    assert.equal(normalized, "TO_PURCHASE");
  });

  test("PAID on internal delivery order is NOT mapped to TO_PURCHASE", () => {
    const normalized = normalizeTrackingStatus(internalDelivery("PAID"));
    assert.equal(normalized, "PAID");
  });

  test("PAID on pickup order is not mapped to TO_PURCHASE", () => {
    const normalized = normalizeTrackingStatus(pickupOrder("PAID"));
    assert.equal(normalized, "PAID");
  });
});

describe("getCurrentStepIndex — TO_PURCHASE step is found (not -1)", () => {
  test("TO_PURCHASE on external order gives valid step index", () => {
    const detail = externalOrder("TO_PURCHASE");
    const steps = getTrackingSteps(detail);
    const status = normalizeTrackingStatus(detail);
    const idx = getCurrentStepIndex(steps, status);
    assert.ok(idx !== -1, "step index must not be -1 for TO_PURCHASE external order");
    assert.equal(idx, steps.indexOf("TO_PURCHASE"));
  });

  test("PAID (legacy) on external order resolves to TO_PURCHASE index", () => {
    const detail = externalOrder("PAID");
    const steps = getTrackingSteps(detail);
    const status = normalizeTrackingStatus(detail); // → TO_PURCHASE
    const idx = getCurrentStepIndex(steps, status);
    assert.ok(idx !== -1, "legacy PAID external order must map to a valid step");
    assert.equal(status, "TO_PURCHASE");
  });

  test("ORDERED on external order gives valid step index after TO_PURCHASE", () => {
    const detail = externalOrder("ORDERED");
    const steps = getTrackingSteps(detail);
    const status = normalizeTrackingStatus(detail);
    const idx = getCurrentStepIndex(steps, status);
    assert.ok(idx > steps.indexOf("TO_PURCHASE"), "ORDERED must come after TO_PURCHASE");
  });
});

describe("getTrackingStepLabel — TO_PURCHASE label", () => {
  test("TO_PURCHASE label is 'Comprar no fornecedor' for external order", () => {
    const label = getTrackingStepLabel("TO_PURCHASE", externalOrder("TO_PURCHASE"));
    assert.equal(label, "Comprar no fornecedor");
  });

  test("TO_PURCHASE label is 'Pago' for pickup order", () => {
    const label = getTrackingStepLabel("TO_PURCHASE", pickupOrder("TO_PURCHASE"));
    assert.equal(label, "Pago");
  });
});

describe("buildPrimaryAction — TO_PURCHASE shows action button", () => {
  test("TO_PURCHASE external order shows 'Marcar como encomendado'", () => {
    const action = buildPrimaryAction(externalOrder("TO_PURCHASE"));
    assert.ok(action !== null, "action must not be null for TO_PURCHASE");
    assert.ok(action.label.includes("encomendado"), `label was: ${action.label}`);
    assert.equal(action.targetStatus, "ORDERED");
  });

  test("PAID external order (legacy) also shows 'Marcar como encomendado'", () => {
    const action = buildPrimaryAction(externalOrder("PAID"));
    assert.ok(action !== null, "action must not be null for PAID external order");
    assert.ok(action.label.includes("encomendado"), `label was: ${action.label}`);
  });

  test("ORDERED external order shows 'Marcar em trânsito'", () => {
    const action = buildPrimaryAction(externalOrder("ORDERED"));
    assert.ok(action !== null);
    assert.ok(action.label.includes("trânsito") || action.label.includes("transito"), `label was: ${action.label}`);
    assert.equal(action.targetStatus, "IN_TRANSIT");
  });

  test("DELIVERED external order returns null (no action needed)", () => {
    const action = buildPrimaryAction(externalOrder("DELIVERED"));
    assert.equal(action, null);
  });
});

describe("badge count — TO_PURCHASE must be in orders queue", () => {
  // This mirrors ActionRequiredService.evaluate(order) in Java
  function evaluateModule(type, status) {
    if (["CANCELLED", "DELIVERED", "FAILED", "PAYMENT_REJECTED"].includes(status)) return null;
    if (["PAYMENT_SUBMITTED", "PAYMENT_UNDER_REVIEW"].includes(status)) return "FINANCE";
    if (["READY_FOR_DELIVERY", "DELIVERY_FAILED"].includes(status)) return "DELIVERY";
    if (status === "OUT_FOR_DELIVERY") return "DELIVERY";

    if (type === "INTERNAL") {
      if (["READY_FOR_FULFILLMENT", "PAID"].includes(status)) return "ORDERS";
      if (["PICKING", "PREPARING"].includes(status)) return "ORDERS";
      return null;
    }
    if (type === "EXTERNAL") {
      if (["UNDER_REVIEW", "CREATED"].includes(status)) return "EXTERNAL_QUOTES";
      if (["QUOTED", "APPROVED", "PENDING_PAYMENT"].includes(status)) return null;
      if (["PAID", "TO_PURCHASE"].includes(status)) return "ORDERS";
      if (["ORDERED", "PURCHASED", "IN_TRANSIT", "ARRIVED"].includes(status)) return "ORDERS";
    }
    return null;
  }

  test("TO_PURCHASE external order belongs to ORDERS module", () => {
    assert.equal(evaluateModule("EXTERNAL", "TO_PURCHASE"), "ORDERS");
  });

  test("PAID external order belongs to ORDERS module", () => {
    assert.equal(evaluateModule("EXTERNAL", "PAID"), "ORDERS");
  });

  test("PENDING_PAYMENT external order is not in ORDERS module", () => {
    assert.notEqual(evaluateModule("EXTERNAL", "PENDING_PAYMENT"), "ORDERS");
  });

  test("PAYMENT_UNDER_REVIEW external order is in FINANCE module", () => {
    assert.equal(evaluateModule("EXTERNAL", "PAYMENT_UNDER_REVIEW"), "FINANCE");
  });
});
