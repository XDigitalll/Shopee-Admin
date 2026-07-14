import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.resolve(adminRoot, "../Xdigital/src/main/java/xdigital/shopee");
const clientRoot = path.resolve(adminRoot, "../shopee-client");

function read(relativePath, root = adminRoot) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("catalog dynamic specifications and variants", () => {
  it("exposes category templates and publishes product variants from the admin", () => {
    const view = read("components/admin/catalog-admin-view.tsx");
    const types = read("lib/admin/catalog-types.ts");

    for (const template of ["SNEAKERS", "CLOTHING", "PHONES", "COMPUTERS", "APPLIANCES", "PERFUMES", "AUTO_PARTS", "FURNITURE", "ACCESSORIES"]) {
      assert.match(view, new RegExp(`key: "${template}"`));
    }
    assert.match(view, /LEGACY_TEMPLATE_KEYS/);
    assert.match(view, /SLUG_TEMPLATE_FALLBACKS/);
    assert.match(types, /specificationTemplate\?: string \| null/);
    assert.match(types, /export type CatalogProductVariantDefinition/);
    assert.match(view, /function CatalogCategoryTemplateSelect/);
    assert.match(view, /function CatalogDynamicSpecifications/);
    assert.match(view, /variants: form\.variants/);
    assert.match(view, /templateSpecs\(form, template\)/);
    assert.match(view, /categoryTemplate\(categories, pricedForm\.categoryId\)/);
    assert.doesNotMatch(view, /Indica o link do fornecedor/);
    assert.match(view, /supplierLink: form\.supplierLink\.trim\(\) \|\| null/);
  });

  it("persists and validates catalog variants on the backend", () => {
    const migration = read("src/main/resources/db/migration/V20260735__catalog_category_templates_and_variants.sql", path.resolve(adminRoot, "../Xdigital"));
    const product = read("catalog/entity/CatalogProduct.java", backendRoot);
    const request = read("catalog/dto/CatalogProductRequest.java", backendRoot);
    const orderRequest = read("catalog/dto/CatalogOrderRequest.java", backendRoot);
    const service = read("catalog/service/CatalogProductService.java", backendRoot);
    const orderService = read("catalog/service/CatalogOrderService.java", backendRoot);

    assert.match(migration, /specification_template VARCHAR\(40\)/);
    assert.match(migration, /variants_json TEXT/);
    assert.match(product, /private String variantsJson/);
    assert.match(request, /List<CatalogProductVariantDTO> variants/);
    assert.doesNotMatch(request, /@NotBlank String supplierLink/);
    assert.match(service, /validateTemplateVariants\(template, cleaned\)/);
    assert.match(orderRequest, /Map<String, String> selectedVariants/);
    assert.match(orderService, /validateSelectedVariants\(product, request\.selectedVariants\(\)\)/);
    assert.match(orderService, /Seleciona " \+ variant\.label\(\) \+ " antes de encomendar\./);
  });

  it("requires client variant selection before sending a catalog order", () => {
    const details = read("components/catalog/catalog-details.tsx", clientRoot);
    const button = read("components/catalog/catalog-order-button.tsx", clientRoot);
    const externalOrder = read("app/(client)/orders/external/new/page.tsx", clientRoot);
    const catalog = read("lib/catalog.ts", clientRoot);

    assert.match(catalog, /variants\?: CatalogProductVariantDefinition\[\]/);
    assert.match(catalog, /selectedVariants/);
    assert.match(details, /missingVariant/);
    assert.match(details, /Seleciona \$\{missingVariant\.label\.toLowerCase\(\)\} antes de encomendar\./);
    assert.match(button, /disabledReason/);
    assert.match(externalOrder, /selectedCatalogVariants/);
    assert.match(externalOrder, /selectedVariants: selectedCatalogVariants/);
  });
});
