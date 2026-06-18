import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../Xdigital/src/main/java/xdigital/shopee",
);
const emailPkg = path.join(backendRoot, "email");
const servicePkg = path.join(backendRoot, "Service");

function readEmail(filename) {
  return fs.readFileSync(path.join(emailPkg, filename), "utf8");
}

function readService(filename) {
  return fs.readFileSync(path.join(servicePkg, filename), "utf8");
}

describe("email communication context — semantic safety", () => {
  describe("OrderCommunicationContext", () => {
    it("defines TYPE_EXTERNAL, TYPE_INTERNAL, TYPE_INTERNAL_COD constants", () => {
      const ctx = readEmail("OrderCommunicationContext.java");
      assert.match(ctx, /TYPE_EXTERNAL = "EXTERNAL"/);
      assert.match(ctx, /TYPE_INTERNAL = "INTERNAL"/);
      assert.match(ctx, /TYPE_INTERNAL_COD = "INTERNAL_COD"/);
    });

    it("exposes isInternalOrder(), canSayInternationalTransit(), canSayArrivedMozambique()", () => {
      const ctx = readEmail("OrderCommunicationContext.java");
      assert.match(ctx, /isInternalOrder/);
      assert.match(ctx, /canSayInternationalTransit/);
      assert.match(ctx, /canSayArrivedMozambique/);
    });
  });

  describe("EmailCopyResolver — INTERNAL orders never use international language", () => {
    it("heroTitle INTERNAL block says 'Recebemos o teu pedido' — never 'internacional'", () => {
      const resolver = readEmail("EmailCopyResolver.java");
      const heroTitleMethod = resolver.slice(
        resolver.indexOf("public String heroTitle"),
        resolver.indexOf("public String heroText"),
      );
      // Isolate only the INTERNAL block (before the // EXTERNAL marker)
      const internalBlock = heroTitleMethod.slice(
        heroTitleMethod.indexOf("if (ctx.isInternalOrder())"),
        heroTitleMethod.indexOf("// EXTERNAL"),
      );
      assert.match(internalBlock, /Recebemos o teu pedido/);
      assert.doesNotMatch(internalBlock, /internacional/i);
      assert.doesNotMatch(internalBlock, /Mocambique.*chegou|chegou.*Mocambique/i);
    });

    it("heroText INTERNAL never mentions 'caminho de Mocambique' or 'produto internacional'", () => {
      const resolver = readEmail("EmailCopyResolver.java");
      const internalHeroText = resolver.slice(
        resolver.indexOf("public String heroText"),
        resolver.indexOf("public String statusLabel"),
      );
      const internalBlock = internalHeroText.slice(
        internalHeroText.indexOf("if (ctx.isInternalOrder())"),
        internalHeroText.indexOf("return switch"),
      );
      assert.doesNotMatch(internalBlock, /caminho de Mocambique/i);
      assert.doesNotMatch(internalBlock, /produto internacional/i);
      assert.doesNotMatch(internalBlock, /fornecedor internacional/i);
    });

    it("heroText EXTERNAL IN_TRANSIT correctly mentions Mocambique (allowed)", () => {
      const resolver = readEmail("EmailCopyResolver.java");
      assert.match(resolver, /caminho de Mocambique/);
      assert.match(resolver, /fornecedor internacional/);
    });

    it("statusLabel INTERNAL never returns 'Chegou a Mocambique'", () => {
      const resolver = readEmail("EmailCopyResolver.java");
      const labelMethod = resolver.slice(
        resolver.indexOf("public String statusLabel"),
        resolver.indexOf("public String humanMessage"),
      );
      // "Chegou a Mocambique" only in external branch
      assert.match(labelMethod, /Chegou a Mocambique/);
      const internalCheck = labelMethod.slice(
        labelMethod.indexOf("isInternalOrder"),
        labelMethod.indexOf("Chegou a Mocambique"),
      );
      // The 'Chegou a Mocambique' string must come AFTER the isInternalOrder check
      // (meaning it's in the external branch of the ternary), not inside isInternalOrder
      assert.ok(
        internalCheck.length > 0,
        "'Chegou a Mocambique' must appear after isInternalOrder guard, not inside INTERNAL block",
      );
    });

    it("footerTagline INTERNAL returns 'Compras e entregas em Mocambique'", () => {
      const resolver = readEmail("EmailCopyResolver.java");
      assert.match(resolver, /Compras e entregas em Mocambique/);
      assert.match(resolver, /Importacao internacional assistida para Mocambique/);
      assert.match(resolver, /isInternalOrder\(\)\s*\?.*Compras e entregas|Compras e entregas.*isInternalOrder/s);
    });

    it("progressBarText INTERNAL never says 'caminho de Mocambique'", () => {
      const resolver = readEmail("EmailCopyResolver.java");
      const method = resolver.slice(
        resolver.indexOf("public String progressBarText"),
        resolver.indexOf("\n    }",resolver.indexOf("public String progressBarText")) + 5,
      );
      assert.match(method, /preparado para entrega/);
      assert.match(method, /caminho de Mocambique/);
      assert.match(method, /isInternalOrder/);
    });

    it("COD heroTitle PAYMENT_PENDING says 'pagamento na entrega'; external block has 'internacional'", () => {
      const resolver = readEmail("EmailCopyResolver.java");
      const heroTitleMethod = resolver.slice(
        resolver.indexOf("public String heroTitle"),
        resolver.indexOf("public String heroText"),
      );
      // INTERNAL block (before // EXTERNAL marker) has COD copy
      const internalBlock = heroTitleMethod.slice(0, heroTitleMethod.indexOf("// EXTERNAL"));
      assert.match(internalBlock, /pagamento na entrega/i);
      assert.doesNotMatch(internalBlock, /Pagamento confirmado com sucesso/);
      // EXTERNAL block (after // EXTERNAL marker) correctly uses "internacional" fallback
      const externalBlock = heroTitleMethod.slice(heroTitleMethod.indexOf("// EXTERNAL"));
      assert.match(externalBlock, /internacional/i);
    });
  });

  describe("StatusTimeline — INTERNAL orders use shortened pipeline", () => {
    it("defines EXTERNAL_STEPS, INTERNAL_STEPS, and INTERNAL_COD_STEPS", () => {
      const timeline = readEmail("StatusTimeline.java");
      assert.match(timeline, /EXTERNAL_STEPS/);
      assert.match(timeline, /INTERNAL_STEPS/);
      assert.match(timeline, /INTERNAL_COD_STEPS/);
    });

    it("INTERNAL_STEPS does not contain PURCHASED or IN_TRANSIT or ARRIVED", () => {
      const timeline = readEmail("StatusTimeline.java");
      const internalStepsBlock = timeline.slice(
        timeline.indexOf("INTERNAL_STEPS = List.of("),
        timeline.indexOf(");", timeline.indexOf("INTERNAL_STEPS = List.of(")),
      );
      assert.doesNotMatch(internalStepsBlock, /"PURCHASED"/);
      assert.doesNotMatch(internalStepsBlock, /"IN_TRANSIT"/);
      assert.doesNotMatch(internalStepsBlock, /"ARRIVED"/);
    });

    it("INTERNAL_COD_STEPS does not contain PURCHASED, IN_TRANSIT, ARRIVED, or PAYMENT_CONFIRMED", () => {
      const timeline = readEmail("StatusTimeline.java");
      const codStepsBlock = timeline.slice(
        timeline.indexOf("INTERNAL_COD_STEPS = List.of("),
        timeline.indexOf(");", timeline.indexOf("INTERNAL_COD_STEPS = List.of(")),
      );
      assert.doesNotMatch(codStepsBlock, /"PURCHASED"/);
      assert.doesNotMatch(codStepsBlock, /"IN_TRANSIT"/);
      assert.doesNotMatch(codStepsBlock, /"ARRIVED"/);
      assert.doesNotMatch(codStepsBlock, /"PAYMENT_CONFIRMED"/);
    });

    it("EXTERNAL_STEPS contains all 9 steps including PURCHASED, IN_TRANSIT, ARRIVED", () => {
      const timeline = readEmail("StatusTimeline.java");
      const externalStepsBlock = timeline.slice(
        timeline.indexOf("EXTERNAL_STEPS = List.of("),
        timeline.indexOf(");", timeline.indexOf("EXTERNAL_STEPS = List.of(")),
      );
      assert.match(externalStepsBlock, /"PURCHASED"/);
      assert.match(externalStepsBlock, /"IN_TRANSIT"/);
      assert.match(externalStepsBlock, /"ARRIVED"/);
    });

    it("stepsFor() routes INTERNAL_COD → INTERNAL_COD_STEPS, INTERNAL → INTERNAL_STEPS, else → EXTERNAL_STEPS", () => {
      const timeline = readEmail("StatusTimeline.java");
      const stepsFor = timeline.slice(
        timeline.indexOf("private static List<Step> stepsFor"),
        timeline.indexOf("\n    }", timeline.indexOf("private static List<Step> stepsFor")) + 5,
      );
      assert.match(stepsFor, /INTERNAL_COD.*INTERNAL_COD_STEPS/s);
      assert.match(stepsFor, /INTERNAL.*INTERNAL_STEPS/s);
      assert.match(stepsFor, /EXTERNAL_STEPS/);
    });

    it("progressBar text branches on orderType — INTERNAL uses preparation text", () => {
      const timeline = readEmail("StatusTimeline.java");
      const progressBar = timeline.slice(
        timeline.indexOf("public static String progressBar"),
        timeline.indexOf("\n    }", timeline.indexOf("public static String progressBar")) + 5,
      );
      assert.match(progressBar, /preparado para entrega/);
      assert.match(progressBar, /caminho de Mocambique/);
      assert.match(progressBar, /isInternal/);
    });
  });

  describe("EmailFooter — tagline branches on orderType", () => {
    it("has overload with orderType param", () => {
      const footer = readEmail("EmailFooter.java");
      assert.match(footer, /render\(String frontendUrl, String supportEmail, String whatsappUrl, String orderType\)/);
    });

    it("backward-compat overload delegates to typed overload", () => {
      const footer = readEmail("EmailFooter.java");
      assert.match(footer, /render\(frontendUrl, supportEmail, whatsappUrl, null\)/);
    });

    it("INTERNAL orderType produces 'Compras e entregas em Mocambique' tagline", () => {
      const footer = readEmail("EmailFooter.java");
      assert.match(footer, /Compras e entregas em Mocambique/);
      assert.match(footer, /isInternal/);
    });

    it("EXTERNAL (null) orderType retains 'Importacao internacional assistida' tagline", () => {
      const footer = readEmail("EmailFooter.java");
      assert.match(footer, /Importacao internacional assistida para Mocambique/);
    });
  });

  describe("EmailService — uses EmailCopyResolver in orderEmail()", () => {
    it("imports EmailCopyResolver and OrderCommunicationContext", () => {
      const service = readService("EmailService.java");
      assert.match(service, /import xdigital\.shopee\.email\.EmailCopyResolver/);
      assert.match(service, /import xdigital\.shopee\.email\.OrderCommunicationContext/);
    });

    it("orderEmail() creates OrderCommunicationContext from order type and payment method", () => {
      const service = readService("EmailService.java");
      const method = service.slice(
        service.indexOf("private String orderEmail(String customerName, Long orderId, OrderStatus fallbackStatus, String ctaLabel"),
        service.indexOf("\n    }", service.indexOf("private String orderEmail(String customerName, Long orderId, OrderStatus fallbackStatus, String ctaLabel")) + 5,
      );
      assert.match(method, /OrderCommunicationContext/);
      assert.match(method, /EmailCopyResolver/);
      assert.match(method, /isExternal/);
      assert.match(method, /isCod/);
      assert.match(method, /CASH_ON_DELIVERY/);
      assert.match(method, /DEPOSIT_PLUS_DELIVERY/);
      assert.match(method, /resolver\.statusLabel/);
      assert.match(method, /resolver\.heroTitle/);
      assert.match(method, /resolver\.heroText/);
      assert.match(method, /resolver\.humanMessage/);
    });

    it("orderEmail() passes orderType as last arg to OrderEmailData", () => {
      const service = readService("EmailService.java");
      const method = service.slice(
        service.indexOf("private String orderEmail(String customerName, Long orderId, OrderStatus fallbackStatus, String ctaLabel"),
        service.indexOf("return OrderTransactionalEmail.render", service.indexOf("private String orderEmail(String customerName, Long orderId, OrderStatus fallbackStatus, String ctaLabel")),
      );
      assert.match(method, /new OrderEmailData\(/);
      assert.match(method, /orderType\)/);
    });

    it("sendInternalCodOrderCreated uses orderEmail() — no longer the html() fallback", () => {
      const service = readService("EmailService.java");
      const method = service.slice(
        service.indexOf("public void sendInternalCodOrderCreated"),
        service.indexOf("\n    }", service.indexOf("public void sendInternalCodOrderCreated")) + 5,
      );
      assert.match(method, /orderEmail\(name, orderId, OrderStatus\.QUOTED\)/);
      assert.doesNotMatch(method, /html\(/);
      assert.doesNotMatch(method, /pagamento na entrega.*A equipa ShopeeMz ira preparar/s);
    });

    it("html() fallback no longer says 'Importacao internacional'", () => {
      const service = readService("EmailService.java");
      const htmlMethod = service.slice(
        service.indexOf("private String html("),
        service.indexOf("\n    }", service.indexOf("private String html(")) + 5,
      );
      assert.doesNotMatch(htmlMethod, /Importacao internacional/i);
    });
  });

  describe("verification-code.html — brand is ShopeeMz not ShopeeX", () => {
    it("header and button text use 'ShopeeMz', not 'ShopeeX'", () => {
      const template = fs.readFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../Xdigital/src/main/resources/templates/email/verification-code.html",
        ),
        "utf8",
      );
      assert.doesNotMatch(template, /ShopeeX/);
      assert.match(template, /ShopeeMz/);
      assert.match(template, /Abrir ShopeeMz/);
    });
  });

  describe("orders/page.tsx — empty state no longer says 'compra internacional'", () => {
    it("empty state text is neutral — no 'internacional' in the no-results message", () => {
      const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
      const page = fs.readFileSync(
        path.resolve(adminRoot, "../shopee-client/app/(client)/orders/page.tsx"),
        "utf8",
      );
      const emptyState = page.slice(
        page.indexOf("Nenhum pedido encontrado"),
        page.indexOf("Nenhum pedido encontrado") + 300,
      );
      assert.doesNotMatch(emptyState, /internacional/i);
      assert.match(emptyState, /nova encomenda|Troca o filtro/);
    });
  });
});
