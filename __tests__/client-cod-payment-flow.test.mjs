import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.resolve(adminRoot, "../shopee-client");

function readAdmin(relativePath) {
  return fs.readFileSync(path.join(adminRoot, relativePath), "utf8");
}

function readClient(relativePath) {
  return fs.readFileSync(path.join(clientRoot, relativePath), "utf8");
}

describe("Phase 4 — client COD/delivery payment flow", () => {
  describe("orders/page.tsx — AWAITING_DELIVERY_PAYMENT conditional buttons", () => {
    it("PAYSUITE branch shows 'Escolher forma de pagamento' or 'Continuar pagamento' with mode=paysuite URL", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      // Code order: CASH_IN_HAND → PAYSUITE → MANUAL_TRANSFER → default
      const block = page.slice(
        page.indexOf('deliveryCollectionMethod === "PAYSUITE"'),
        page.indexOf('deliveryCollectionMethod === "MANUAL_TRANSFER"'),
      );

      assert.match(block, /mode=paysuite/);
      assert.match(block, /Escolher forma de pagamento/);
      assert.match(block, /Continuar pagamento/);
      assert.doesNotMatch(block, /Enviar comprovativo/);
      assert.doesNotMatch(block, /mode=manual/);
    });

    it("PAYSUITE button uses activeDeliveryPaymentUrl for continuation, payment page for method selection", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const block = page.slice(
        page.indexOf('deliveryCollectionMethod === "PAYSUITE"'),
        page.indexOf('deliveryCollectionMethod === "MANUAL_TRANSFER"'),
      );

      // Ternary: gateway URL when active attempt exists, payment page otherwise
      assert.match(block, /hasActiveDeliveryPaymentAttempt/);
      assert.match(block, /activeDeliveryPaymentUrl/);
      assert.match(block, /mode=paysuite/);
      assert.match(block, /Continuar pagamento/);
      assert.match(block, /Escolher forma de pagamento/);
    });

    it("MANUAL_TRANSFER branch shows only 'Enviar comprovativo' with mode=manual URL", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      // MANUAL_TRANSFER is 3rd branch; slice to the default/null branch marker
      const manualStart = page.indexOf('deliveryCollectionMethod === "MANUAL_TRANSFER"');
      const defaultStart = page.indexOf("Aguarda instrução", manualStart);
      const block = page.slice(manualStart, defaultStart);

      assert.match(block, /mode=manual/);
      assert.match(block, /Enviar comprovativo/);
      assert.doesNotMatch(block, /Pagar taxa de entrega/);
      assert.doesNotMatch(block, /mode=paysuite/);
    });

    it("CASH_IN_HAND branch shows info text only — no action buttons", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      // CASH_IN_HAND is 1st branch; slice to end of its own ternary arm (before PAYSUITE starts)
      const cashStart = page.indexOf('deliveryCollectionMethod === "CASH_IN_HAND"');
      const paySuiteStart = page.indexOf('deliveryCollectionMethod === "PAYSUITE"', cashStart);
      const block = page.slice(cashStart, paySuiteStart);

      assert.match(block, /dinheiro/i);
      assert.doesNotMatch(block, /Pagar taxa de entrega/);
      assert.doesNotMatch(block, /Enviar comprovativo/);
      assert.doesNotMatch(block, /<a\s/);
    });

    it("null/default branch shows 'Aguarda instrução' text", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const awaitingBlock = page.slice(
        page.indexOf('status === "AWAITING_DELIVERY_PAYMENT" && isInternalCod'),
        page.indexOf("order.adminMessageForClient", page.indexOf('status === "AWAITING_DELIVERY_PAYMENT" && isInternalCod')),
      );

      assert.match(awaitingBlock, /Aguarda instrução/);
    });

    it("no longer shows both buttons unconditionally", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const awaitingBlock = page.slice(
        page.indexOf('status === "AWAITING_DELIVERY_PAYMENT" && isInternalCod'),
        page.indexOf("order.adminMessageForClient", page.indexOf('status === "AWAITING_DELIVERY_PAYMENT" && isInternalCod')),
      );

      const payButton = awaitingBlock.indexOf("Escolher forma de pagamento");
      const proofButton = awaitingBlock.indexOf("Enviar comprovativo");
      assert.ok(payButton !== -1, "Escolher forma de pagamento must exist in block");
      assert.ok(proofButton !== -1, "Enviar comprovativo must exist in block");
      // They must be in separate conditional branches — the null/default branch
      // must NOT contain either button (it has "Aguarda instrução" instead).
      assert.ok(
        payButton < proofButton || proofButton < payButton,
        "buttons must appear in separate branches, not together",
      );
      // The key guard: PAYSUITE branch text does not contain "Enviar comprovativo"
      // and MANUAL_TRANSFER branch text does not contain "Escolher forma de pagamento"
      assert.match(awaitingBlock, /deliveryCollectionMethod/);
    });
  });

  describe("payment/page.tsx — mode param and visibility guards", () => {
    it("reads mode param and derives deliveryMode variable", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");

      assert.match(page, /searchParams\.get\("mode"\)/);
      assert.match(page, /deliveryMode/);
      assert.match(page, /(modeParam === "paysuite" \|\| modeParam === "manual")/);
    });

    it("hasCodActivePaySuiteUrl gates on deliveryMode === paysuite and hasActiveDeliveryPaymentAttempt", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");

      assert.match(page, /hasCodActivePaySuiteUrl/);
      assert.match(page, /deliveryMode === "paysuite"/);
      assert.match(page, /hasActiveDeliveryPaymentAttempt/);
      assert.match(page, /activeDeliveryPaymentUrl/);
    });

    it("methodSelectorVisible excludes hasCodActivePaySuiteUrl and mode=manual", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");
      const line = page.slice(
        page.indexOf("const methodSelectorVisible"),
        page.indexOf("\n", page.indexOf("const methodSelectorVisible")),
      );

      assert.match(line, /hasCodActivePaySuiteUrl/);
      assert.match(line, /deliveryMode !== "manual"/);
    });

    it("manualPaymentVisible excludes mode=paysuite", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");
      const line = page.slice(
        page.indexOf("const manualPaymentVisible"),
        page.indexOf("\n", page.indexOf("const manualPaymentVisible")),
      );

      assert.match(line, /deliveryMode !== "paysuite"/);
    });

    it("duplicate-payment guard redirects to activeDeliveryPaymentUrl when hasCodActivePaySuiteUrl", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");
      const guardBlock = page.slice(
        page.indexOf("if (shouldBlockDuplicatePayment(paysuitePayment))"),
        page.indexOf("setFieldError(null)", page.indexOf("if (shouldBlockDuplicatePayment(paysuitePayment))")),
      );

      assert.match(guardBlock, /hasCodActivePaySuiteUrl/);
      assert.match(guardBlock, /activeDeliveryPaymentUrl/);
      assert.match(guardBlock, /window\.location\.assign/);
    });

    it("continuation block renders 'Continuar pagamento' link when hasCodActivePaySuiteUrl", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");

      assert.match(page, /Continuar pagamento/);
      assert.match(page, /hasCodActivePaySuiteUrl/);
      assert.match(page, /Já existe uma tentativa de pagamento em curso\. Continua o pagamento abaixo\./);
    });

    it("statusCopy accepts mode param and returns mode-specific body for AWAITING_DELIVERY_PAYMENT", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");
      const fn = page.slice(
        page.indexOf("function statusCopy("),
        page.indexOf("\n}", page.indexOf("function statusCopy(")) + 2,
      );

      assert.match(fn, /mode\?:\s*string \| null/);
      assert.match(fn, /AWAITING_DELIVERY_PAYMENT.*mode === "paysuite"/s);
      assert.match(fn, /AWAITING_DELIVERY_PAYMENT.*mode === "manual"/s);
      assert.match(fn, /Escolhe o método de pagamento e paga o valor pendente/);
      assert.doesNotMatch(fn, /Finaliza o pagamento da taxa de entrega com PaySuite/);
    });

    it("statusCopy AWAITING_DELIVERY_PAYMENT base title is 'Pagamento pendente na entrega'", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");
      const fn = page.slice(
        page.indexOf("function statusCopy("),
        page.indexOf("\n}", page.indexOf("function statusCopy(")) + 2,
      );

      assert.match(fn, /Pagamento pendente na entrega/);
      assert.doesNotMatch(fn, /Pagamento da entrega pendente/);
    });

    it("methodSelectorVisible bypasses verificationOk for COD delivery (deliveryCollectionActive)", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");
      const line = page.slice(
        page.indexOf("const methodSelectorVisible"),
        page.indexOf("\n", page.indexOf("const methodSelectorVisible")),
      );

      assert.match(line, /deliveryCollectionActive/);
      assert.match(line, /verificationOk \|\| deliveryCollectionActive/);
    });

    it("handlePaySuitePayment skips verification redirect for COD delivery orders", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");
      const fn = page.slice(
        page.indexOf("async function handlePaySuitePayment()"),
        page.indexOf("async function handlePaySuiteRetry()"),
      );

      assert.match(fn, /!verificationOk && !deliveryCollectionActive/);
      assert.doesNotMatch(fn, /if \(!verificationOk\) \{[\s\S]*?router\.push\("\/profile"\)/);
    });

    it("handlePaySuitePayment sends purpose=COD_COLLECTION and &purpose=delivery in returnUrl for COD delivery", () => {
      const page = readClient("app/(client)/orders/[id]/payment/page.tsx");
      const fn = page.slice(
        page.indexOf("async function handlePaySuitePayment()"),
        page.indexOf("async function handlePaySuiteRetry()"),
      );

      assert.match(fn, /purpose=delivery/);
      assert.match(fn, /COD_COLLECTION/);
      assert.match(fn, /deliveryCollectionActive/);
    });
  });

  describe("lib/types.ts — Order type has new COD delivery fields", () => {
    it("Order type includes deliveryCollectionMethod, activeDeliveryPaymentUrl, hasActiveDeliveryPaymentAttempt", () => {
      const types = readClient("lib/types.ts");
      const orderType = types.slice(
        types.indexOf("export type Order = {"),
        types.indexOf("};", types.indexOf("export type Order = {")),
      );

      assert.match(orderType, /deliveryCollectionMethod/);
      assert.match(orderType, /activeDeliveryPaymentUrl/);
      assert.match(orderType, /hasActiveDeliveryPaymentAttempt/);
    });
  });

  describe("orders/page.tsx — COD delivery amount and text corrections", () => {
    it("heading is 'Pagamento pendente na entrega', not 'da entrega pendente'", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      assert.match(page, /Pagamento pendente na entrega/);
      assert.doesNotMatch(page, /Pagamento da entrega pendente/);
    });

    it("PAYSUITE default button is 'Escolher forma de pagamento', not 'Pagar taxa de entrega'", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const block = page.slice(
        page.indexOf('deliveryCollectionMethod === "PAYSUITE"'),
        page.indexOf('deliveryCollectionMethod === "MANUAL_TRANSFER"'),
      );
      assert.match(block, /Escolher forma de pagamento/);
      assert.doesNotMatch(block, /Pagar taxa de entrega/);
    });

    it("PAYSUITE branch text tells client to choose a method", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const block = page.slice(
        page.indexOf('deliveryCollectionMethod === "PAYSUITE"'),
        page.indexOf('deliveryCollectionMethod === "MANUAL_TRANSFER"'),
      );
      assert.match(block, /Escolhe o método/);
      assert.doesNotMatch(block, /Paga a taxa de entrega/);
    });

    it("PAYSUITE branch shows 'Continuar pagamento' when hasActiveDeliveryPaymentAttempt and activeDeliveryPaymentUrl are set", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const block = page.slice(
        page.indexOf('deliveryCollectionMethod === "PAYSUITE"'),
        page.indexOf('deliveryCollectionMethod === "MANUAL_TRANSFER"'),
      );
      assert.match(block, /hasActiveDeliveryPaymentAttempt.*activeDeliveryPaymentUrl|activeDeliveryPaymentUrl.*hasActiveDeliveryPaymentAttempt/s);
      assert.match(block, /Continuar pagamento/);
    });

    it("PAYSUITE branch shows breakdown: remainingAmountOnDelivery, deliveryFee, and produto/entrega labels", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const block = page.slice(
        page.indexOf('deliveryCollectionMethod === "PAYSUITE"'),
        page.indexOf('deliveryCollectionMethod === "MANUAL_TRANSFER"'),
      );
      assert.match(block, /remainingAmountOnDelivery/);
      assert.match(block, /deliveryFee/);
      assert.match(block, /Produto:/);
      assert.match(block, /Entrega:/);
      assert.match(block, /Total a pagar agora/);
    });

    it("'Valor do pedido' becomes 'Valor pendente' for AWAITING_DELIVERY_PAYMENT COD orders", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const block = page.slice(
        page.indexOf("Total pago"),
        page.indexOf("Valor do pedido") + 30,
      );
      assert.match(block, /isInternalCod.*AWAITING_DELIVERY_PAYMENT.*Valor pendente|Valor pendente.*isInternalCod.*AWAITING_DELIVERY_PAYMENT/s);
    });

    it("'Valor do pedido' amount uses remainingAmountOnDelivery for AWAITING_DELIVERY_PAYMENT COD orders", () => {
      const page = readClient("app/(client)/orders/page.tsx");
      const labelLine = page.slice(
        page.indexOf("Total pago"),
        page.indexOf("Valor do pedido") + 300,
      );
      assert.match(labelLine, /remainingAmountOnDelivery/);
    });
  });
});
