import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.resolve(adminRoot, "../Xdigital/src/main/java/xdigital/shopee");

function read(relativePath, root = adminRoot) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("catalog imported product pricing", () => {
  it("loads finance quote options and derives catalog product snapshots from them", () => {
    const view = read("components/admin/catalog-admin-view.tsx");

    assert.match(view, /adminApiFetch<QuoteOptionsResponse>\("\/api\/admin\/quotes\/options"\)/);
    assert.match(view, /calculateCatalogPricing\(form, options\)/);
    assert.match(view, /activeRateFor\(options, currency\)/);
    assert.match(view, /routeById\(options, form\.routeId\)/);
    assert.match(view, /exchangeRateSnapshot: pricing\.exchangeRate > 0/);
    assert.match(view, /finalPrice: pricing\.finalMzn > 0/);
  });

  it("removes manual exchange/customs/commission editing from the product import section", () => {
    const view = read("components/admin/catalog-admin-view.tsx");
    const modalStart = view.indexOf("function CatalogProductModal");
    const modalEnd = view.indexOf("function CatalogCategoryModal");
    const modal = view.slice(modalStart, modalEnd);

    assert.match(modal, /<select className="admin-input[^"]*" value=\{form\.currency\}/);
    assert.match(modal, /Rota de transporte/);
    assert.match(modal, /Automático pela rota/);
    assert.match(modal, /Taxa utilizada/);
    assert.match(modal, /Alfândega/);
    assert.match(modal, /Comissão/);
    assert.doesNotMatch(modal, /onChange=\{\(event\) => onChange\(\{ \.\.\.form, exchangeRateSnapshot/);
    assert.doesNotMatch(modal, /onChange=\{\(event\) => onChange\(\{ \.\.\.form, customsCost/);
    assert.doesNotMatch(modal, /onChange=\{\(event\) => onChange\(\{ \.\.\.form, commissionValue/);
  });

  it("blocks publishing without an active currency rate, route, or calculated total", () => {
    const view = read("components/admin/catalog-admin-view.tsx");

    assert.match(view, /A moeda \$\{pricing\.currency \|\| "selecionada"\} não está activa em Finanças\./);
    assert.match(view, /Não existe uma taxa de câmbio activa para \$\{pricing\.currency\}\./);
    assert.match(view, /Seleciona uma rota de transporte\./);
    assert.match(view, /O preço final calculado não pode ser zero\./);
  });

  it("recalculates catalog product snapshots on the backend when a route is supplied", () => {
    const request = read("catalog/dto/CatalogProductRequest.java", backendRoot);
    const service = read("catalog/service/CatalogProductService.java", backendRoot);

    assert.match(request, /Long routeId/);
    assert.match(service, /ExchangeRateService exchangeRateService/);
    assert.match(service, /ShippingRouteService shippingRouteService/);
    assert.match(service, /PricingCalculationService pricingCalculationService/);
    assert.match(service, /shippingRouteService\.getActive\(request\.routeId\(\)\)/);
    assert.match(service, /exchangeRateService\.getActiveRate\(baseCurrency, CurrencyCode\.MZN\)/);
    assert.match(service, /pricingCalculationService\.calculateRouteQuote\(quote\)/);
    assert.match(service, /product\.setFinalPrice\(totals\.totalMzn\(\)\)/);
  });
});
