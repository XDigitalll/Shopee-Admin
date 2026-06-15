import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} not found`);

  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} not found after ${start}`);

  return source.slice(startIndex, endIndex);
}

describe("internal COD prepare-product action wiring", () => {
  it("maps Preparar produto to advance-order only", () => {
    const orderActions = read("lib/admin/order-actions.ts");

    assert.match(
      orderActions,
      /label:\s*"Preparar produto",\s*action:\s*"advance-order"/,
      "Preparar produto must call the advance action",
    );
    assert.doesNotMatch(
      orderActions,
      /label:\s*"Preparar produto",\s*action:\s*"mark-ready-for-delivery"/,
      "Preparar produto must not call mark-ready-for-delivery",
    );
    assert.doesNotMatch(
      orderActions,
      /label:\s*"Preparar produto"[\s\S]{0,160}(delivery\/start|delivery-start|startDelivery)/,
      "Preparar produto must not start delivery",
    );
  });

  it("uses separate endpoints for prepare and ready-for-delivery handlers", () => {
    const listView = read("components/admin/orders-management-view.tsx");
    const detailView = read("components/admin/order-detail-view.tsx");
    const prepareHandler = sliceBetween(
      listView,
      "async function handlePrepareProduct()",
      "async function handleMarkReadyForDelivery()",
    );
    const readyHandler = sliceBetween(
      listView,
      "async function handleMarkReadyForDelivery()",
      "function resetPurchaseModal()",
    );
    const advanceBranch = sliceBetween(
      detailView,
      'if (action === "advance-order")',
      'if (action === "mark-ready-for-delivery")',
    );
    const readyBranch = sliceBetween(
      detailView,
      'if (action === "mark-ready-for-delivery")',
      'if (action === "collect-and-deliver")',
    );

    assert.match(prepareHandler, /\/api\/admin\/orders\/\$\{order\.id\}\/advance/);
    assert.doesNotMatch(prepareHandler, /mark-ready-for-delivery|delivery\/start|delivery-start|startDelivery/);
    assert.match(readyHandler, /\/api\/admin\/orders\/\$\{order\.id\}\/mark-ready-for-delivery/);

    assert.match(advanceBranch, /\/api\/admin\/orders\/\$\{detail\.id\}\/advance/);
    assert.doesNotMatch(advanceBranch, /mark-ready-for-delivery|delivery\/start|delivery-start|startDelivery/);
    assert.match(readyBranch, /\/api\/admin\/orders\/\$\{detail\.id\}\/mark-ready-for-delivery/);
  });

  it("keeps start delivery separate from COD payment request", () => {
    const orderActions = read("lib/admin/order-actions.ts");
    const listView = read("components/admin/orders-management-view.tsx");
    const detailView = read("components/admin/order-detail-view.tsx");
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const startDeliveryHandler = sliceBetween(
      listView,
      "async function handleStartDelivery()",
      "async function handlePaymentValidation()",
    );
    const startDeliveryBranch = sliceBetween(
      detailView,
      'if (action === "start-delivery")',
      'if (action === "advance-order")',
    );
    const codRequestHandler = sliceBetween(
      deliveryModule,
      "async function requestCodPayment(order: DeliveryActiveOrder)",
      "async function confirmCodCash(order: DeliveryActiveOrder)",
    );
    const codAction = sliceBetween(
      orderActions,
      'actions.push({ key: "cod-arrive"',
      "} else {",
    );

    assert.match(
      orderActions,
      /label:\s*"Mandar para entrega",\s*action:\s*"start-delivery"/,
      "READY_FOR_DELIVERY must start the route, not request payment",
    );
    assert.match(
      orderActions,
      /label:\s*"Cobrar cliente",\s*action:\s*"cod-request-payment"/,
      "OUT_FOR_DELIVERY COD must request payment explicitly",
    );
    assert.doesNotMatch(codAction, /targetStatus:\s*"DELIVERED"|delivery-complete|collect-and-close/);

    assert.match(startDeliveryHandler, /\/api\/orders\/\$\{order\.id\}\/delivery-start/);
    assert.doesNotMatch(startDeliveryHandler, /request-delivery-payment|confirm-cash-collected|delivery-complete/);
    assert.match(startDeliveryBranch, /\/api\/orders\/\$\{detail\.id\}\/delivery-start/);
    assert.doesNotMatch(startDeliveryBranch, /request-delivery-payment|confirm-cash-collected|delivery-complete/);

    assert.match(codRequestHandler, /\/api\/admin\/orders\/\$\{order\.id\}\/cod\/request-delivery-payment/);
    assert.doesNotMatch(codRequestHandler, /delivery-start|delivery-complete|confirm-cash-collected/);
  });
});
