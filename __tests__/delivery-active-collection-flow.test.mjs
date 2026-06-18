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

  it("PaySuite admin action marks collection method and returns client payment page, not gateway URL", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const paySuiteHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function sendPaySuiteDeliveryCharge"),
      deliveryModule.indexOf("async function registerManualTransfer"),
    );
    const shared = read("app/api/admin/delivery/_shared.ts");

    assert.match(paySuiteHandler, /delivery\/orders\/\$\{freshOrder\.id\}\/collection/);
    assert.match(paySuiteHandler, /paymentUrl|checkoutUrl/);
    assert.match(shared, /"AWAITING_DELIVERY_PAYMENT"/);
    // Admin modal shows "link de pagamento gerado", not a gateway-specific label
    assert.match(deliveryModule, /Link de pagamento gerado e copiado/);
    assert.match(deliveryModule, /Abrir página de pagamento/);
    assert.doesNotMatch(deliveryModule, /Abrir link PaySuite/);
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

  it("sendPaySuiteDeliveryCharge endpoint always uses the clicked card's order.id", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const paySuiteHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function sendPaySuiteDeliveryCharge"),
      deliveryModule.indexOf("async function registerManualTransfer"),
    );

    // Endpoint URL is built from the function parameter `order.id`
    assert.match(paySuiteHandler, /delivery\/orders\/\$\{freshOrder\.id\}\/collection/);
    // The call site passes collectionModal.order — the order locked at modal-open time
    assert.match(deliveryModule, /sendPaySuiteDeliveryCharge\(collectionModal\.order\)/);
    // Modal identity guard prevents stale-state mismatch
    assert.match(paySuiteHandler, /collectionModal\?\.order\.id !== order\.id/);
    assert.match(paySuiteHandler, /revalidateActiveOrderForCollection\(order\)/);
  });

  it("returnUrl for PaySuite delivery charge uses CLIENT_APP_URL with correct params, never admin origin", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const paySuiteHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function sendPaySuiteDeliveryCharge"),
      deliveryModule.indexOf("async function registerManualTransfer"),
    );

    assert.match(paySuiteHandler, /CLIENT_APP_URL/);
    assert.match(paySuiteHandler, /mode=paysuite/);
    assert.match(paySuiteHandler, /purpose=delivery/);
    assert.doesNotMatch(paySuiteHandler, /window\.location\.origin/);
    assert.doesNotMatch(paySuiteHandler, /delivery=1/);
  });

  it("resolveDeliveryChargeAmount uses remainingAmountOnDelivery or deliveryFee — never totalAmount", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const resolver = deliveryModule.slice(
      deliveryModule.indexOf("function resolveDeliveryChargeAmount"),
      deliveryModule.indexOf("\n}", deliveryModule.indexOf("function resolveDeliveryChargeAmount")) + 2,
    );

    assert.match(resolver, /remainingAmountOnDelivery/);
    assert.match(resolver, /deliveryFee/);
    assert.match(resolver, /Math\.max\(0, Number\(order\.remainingAmountOnDelivery \?\? 0\)\)/);
    assert.match(resolver, /Math\.max\(0, Number\(order\.deliveryFee \?\? 0\)\)/);
    assert.match(resolver, /remainingProductAmount \+ deliveryFee/);
    assert.doesNotMatch(resolver, /totalAmount/);
  });

  it("sendPaySuiteDeliveryCharge aborts with error when charge amount is 0 or unresolvable", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const paySuiteHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function sendPaySuiteDeliveryCharge"),
      deliveryModule.indexOf("async function registerManualTransfer"),
    );

    assert.match(paySuiteHandler, /chargeAmount <= 0/);
    assert.match(paySuiteHandler, /Nao foi possivel determinar o valor a cobrar/);
  });

  it("sendPaySuiteDeliveryCharge revalidates state and blocks duplicate or confirmed charges", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const paySuiteHandler = deliveryModule.slice(
      deliveryModule.indexOf("async function sendPaySuiteDeliveryCharge"),
      deliveryModule.indexOf("async function registerManualTransfer"),
    );

    assert.match(paySuiteHandler, /revalidateActiveOrderForCollection\(order\)/);
    assert.match(paySuiteHandler, /isDeliveryPaymentResolved\(freshOrder\)/);
    assert.match(paySuiteHandler, /hasActiveCodPaySuiteCharge\(freshOrder\)/);
    assert.match(paySuiteHandler, /amount: chargeAmount/);
  });

  it("admin modal label is 'Total pendente a cobrar', not 'Valor a cobrar'", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const modal = deliveryModule.slice(
      deliveryModule.indexOf("collectionModal ? ("),
      deliveryModule.indexOf("AdminConfirmDialog", deliveryModule.indexOf("collectionModal ? (")),
    );

    assert.match(modal, /Cobranca pendente do pedido/);
    assert.match(modal, /O cliente vai pagar/);
    assert.match(modal, /TOTAL/);
    assert.doesNotMatch(modal, /Valor a cobrar/);
    assert.doesNotMatch(modal, /Cobranca da entrega/);
  });

  it("admin modal shows breakdown: Produto pendente and Taxa de entrega when deliveryFee > 0", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const modal = deliveryModule.slice(
      deliveryModule.indexOf("collectionModal ? ("),
      deliveryModule.indexOf("AdminConfirmDialog", deliveryModule.indexOf("collectionModal ? (")),
    );

    assert.match(modal, /Produto pendente/);
    assert.match(modal, /Taxa de entrega/);
    assert.match(modal, /resolveDeliveryChargeBreakdown\(collectionModal\.order\)\.remainingProductAmount/);
    assert.match(modal, /resolveDeliveryChargeBreakdown\(collectionModal\.order\)\.deliveryFee/);
    assert.match(modal, /resolveDeliveryChargeBreakdown\(collectionModal\.order\)\.total/);
  });

  it("hasActiveCodPaySuiteCharge detects COD_PAYMENT_REQUESTED + PAYSUITE method", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const fn = deliveryModule.slice(
      deliveryModule.indexOf("function hasActiveCodPaySuiteCharge("),
      deliveryModule.indexOf("\n}", deliveryModule.indexOf("function hasActiveCodPaySuiteCharge(")) + 2,
    );

    assert.match(fn, /COD_PAYMENT_REQUESTED/);
    assert.match(fn, /PENDING/);
    assert.match(fn, /PAYSUITE/);
    assert.match(fn, /codPaymentCollectionMethod/);
    assert.match(fn, /paymentStatus/);
  });

  it("admin card hides 'Cobrar cliente' and shows 'Pagamento em curso' when activeCodPaySuite", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const card = deliveryModule.slice(
      deliveryModule.indexOf("const activeCodPaySuite"),
      deliveryModule.indexOf("isOnRoute && !isAwaitingPayment"),
    );

    assert.match(card, /activeCodPaySuite/);
    assert.match(card, /Pagamento em curso \(PaySuite\)/);
    assert.match(card, /Aguarda a confirmacao do cliente/);
    assert.match(card, /Reenviar link/);
    // When activeCodPaySuite is true, "Cobrar cliente" must be in the else branch
    const paySuiteBlock = card.slice(card.indexOf("activeCodPaySuite ?"), card.indexOf(": null}"));
    assert.doesNotMatch(paySuiteBlock.slice(0, paySuiteBlock.indexOf("Cobrar cliente")), /activeCodPaySuite \? \(/);
  });

  it("admin card 'Cobrar cliente' appears only when no activeCodPaySuite", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const card = deliveryModule.slice(
      deliveryModule.indexOf("const activeCodPaySuite"),
      deliveryModule.indexOf("isOnRoute && !isAwaitingPayment"),
    );

    // "Cobrar cliente" must come AFTER the activeCodPaySuite ternary (in the else branch)
    const paySuiteIdx = card.indexOf("activeCodPaySuite ?");
    const cobrarIdx = card.indexOf("Cobrar cliente");
    assert.ok(cobrarIdx > paySuiteIdx, "'Cobrar cliente' must be in else branch, after activeCodPaySuite check");
  });

  it("Reenviar link uses CLIENT_APP_URL with mode=paysuite and purpose=delivery", () => {
    const deliveryModule = read("components/admin/delivery-module.tsx");
    const reenviarBlock = deliveryModule.slice(
      deliveryModule.indexOf("Reenviar link"),
      deliveryModule.indexOf("Reenviar link") + 400,
    );
    // Look backwards for the href that contains the link
    const linkBlock = deliveryModule.slice(
      deliveryModule.lastIndexOf("CLIENT_APP_URL", deliveryModule.indexOf("Reenviar link")),
      deliveryModule.indexOf("Reenviar link") + 50,
    );

    assert.match(linkBlock, /CLIENT_APP_URL/);
    assert.match(linkBlock, /mode=paysuite/);
    assert.match(linkBlock, /purpose=delivery/);
    void reenviarBlock;
  });

  it("DeliveryActiveOrder type includes codPaymentCollectionMethod", () => {
    const types = read("lib/admin/types.ts");
    const activeOrderType = types.slice(
      types.indexOf("export type DeliveryActiveOrder = {"),
      types.indexOf("};", types.indexOf("export type DeliveryActiveOrder = {")),
    );

    assert.match(activeOrderType, /codPaymentCollectionMethod/);
  });

  it("mapActiveOrder in _shared.ts reads codPaymentCollectionMethod from backend", () => {
    const shared = read("app/api/admin/delivery/_shared.ts");

    assert.match(shared, /codPaymentCollectionMethod/);
    assert.match(shared, /readNullableString.*codPaymentCollectionMethod|codPaymentCollectionMethod.*readNullableString/s);
  });

  it("backend idempotency guard: collectDeliveryPayment PAYSUITE checks for existing active charge", () => {
    const service = fs.readFileSync(
      path.join(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
        "Xdigital/src/main/java/xdigital/shopee/Service/OrderStateService.java",
      ),
      "utf8",
    );
    const guard = service.slice(
      service.indexOf("PAYSUITE: early idempotency guard"),
      service.indexOf("if (\"CASH\".equals(method)"),
    );

    assert.match(guard, /COD_PAYMENT_REQUESTED/);
    assert.match(guard, /PAYSUITE/);
    assert.match(guard, /PAYSUITE_COLLECTION_IDEMPOTENT/);
    assert.match(guard, /Pagamento ja recebido/);
  });
});
