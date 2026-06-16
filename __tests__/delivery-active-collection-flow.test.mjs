import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("delivery active collection flow", () => {
  it("OUT_FOR_DELIVERY shows Cobrar cliente in the active delivery card", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const activeCard = deliveryModule.slice(
      deliveryModule.indexOf('const isOnRoute = order.status === "OUT_FOR_DELIVERY" || isAwaitingPayment;'),
      deliveryModule.indexOf("<AdminConfirmDialog", deliveryModule.indexOf('const isOnRoute = order.status === "OUT_FOR_DELIVERY" || isAwaitingPayment;')),
    );

    assert.match(activeCard, /order\.status === "OUT_FOR_DELIVERY" \|\| isAwaitingPayment/);
    assert.match(activeCard, /Cobrar cliente/);
    assert.match(activeCard, /cashConfirmed:\s*false/);
    assert.match(activeCard, /transferReference:\s*""/);
  });

  it("READY_FOR_DELIVERY is not active and cannot show Cobrar cliente in active delivery", () => {
    const shared = read("app/api/admin/delivery/_shared.ts");
    const activeSetMatch = shared.match(/const ACTIVE_DELIVERY_STATUSES = new Set\(\[(.*?)\]\);/s);

    assert.ok(activeSetMatch, "ACTIVE_DELIVERY_STATUSES must be declared");
    assert.match(activeSetMatch[1], /"OUT_FOR_DELIVERY"/);
    assert.match(activeSetMatch[1], /"AWAITING_DELIVERY_PAYMENT"/);
    assert.doesNotMatch(activeSetMatch[1], /"READY_FOR_DELIVERY"/);
  });

  it("blocks DELIVERED while delivery payment is pending", () => {
    const completeRoute = read("app/api/orders/[id]/delivery-complete/route.ts");
    const statusRoute = read("app/api/admin/orders/[id]/status/route.ts");

    assert.match(completeRoute, /hasPendingDeliveryPayment\(order\)/);
    assert.match(completeRoute, /valor pendente/);
    assert.match(statusRoute, /targetStatus === "DELIVERED"/);
    assert.match(statusRoute, /hasPendingDeliveryPayment\(order\)/);
    assert.match(statusRoute, /valor pendente/);
  });

  it("cash received records financial and timeline details", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const cashHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function confirmCodCash"),
      deliveryModule.indexOf("if (loading)", deliveryModule.indexOf("async function confirmCodCash")),
    );

    assert.match(cashHandler, /amountCollected/);
    assert.match(cashHandler, /Confirmo que recebi o dinheiro em maos/);
    assert.match(cashHandler, /method:\s*"CASH"/);
    assert.match(cashHandler, /delivery\/orders\/\$\{order\.id\}\/collection/);
  });

  it("PaySuite charge puts the order in awaiting delivery payment flow", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const paySuiteHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function sendPaySuiteDeliveryCharge"),
      deliveryModule.indexOf("async function registerManualTransfer"),
    );
    const shared = read("app/api/admin/delivery/_shared.ts");

    assert.match(paySuiteHandler, /link PaySuite/);
    assert.match(paySuiteHandler, /delivery\/orders\/\$\{order\.id\}\/collection/);
    assert.match(paySuiteHandler, /paymentUrl|checkoutUrl/);
    assert.match(shared, /"AWAITING_DELIVERY_PAYMENT"/);
  });

  it("manual transfer opens the finance manual payments queue", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const transferHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function registerManualTransfer"),
      deliveryModule.indexOf("async function confirmCodCash"),
    );

    assert.match(transferHandler, /method:\s*"MANUAL_TRANSFER"/);
    assert.match(transferHandler, /transactionReference:\s*transferReference/);
    assert.match(transferHandler, /admin\/payments\?orderId=\$\{order\.id\}&queue=AWAITING/);
    assert.match(transferHandler, /pagamentos manuais/);
  });

  it("cash collection auto-calls delivery-complete after success", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const cashHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function confirmCodCash"),
      deliveryModule.indexOf("if (loading)", deliveryModule.indexOf("async function confirmCodCash")),
    );

    assert.match(cashHandler, /delivery-complete/);
    assert.match(cashHandler, /Dinheiro recebido em maos. Entrega concluida\./);
    assert.match(cashHandler, /delivery\/orders\/\$\{order\.id\}\/collection/);
  });

  it("mark-not-collected button and modal are wired to cod/mark-not-collected", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const notCollectedFn = deliveryModule.slice(
      deliveryModule.indexOf("async function markNotCollected()"),
      deliveryModule.indexOf("async function confirmCodCash"),
    );

    assert.match(notCollectedFn, /cod\/mark-not-collected/);
    assert.match(notCollectedFn, /reason\.trim\(\)/);
    assert.match(deliveryModule, /markNotCollectedModal/);
  });
});
