import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.resolve(adminRoot, "../Xdigital/src/main/java/xdigital/shopee");
const migrationRoot = path.resolve(adminRoot, "../Xdigital/src/main/resources/db/migration");

function read(relativePath, root = adminRoot) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("catalog category template rendering", () => {
  it("uses the stable backend enum and normalizes legacy category template values", () => {
    const enumFile = read("catalog/dto/CatalogSpecificationTemplate.java", backendRoot);
    const categoryRequest = read("catalog/dto/CatalogCategoryRequest.java", backendRoot);
    const taxonomyDto = read("catalog/dto/CatalogTaxonomyDTO.java", backendRoot);
    const mapper = read("catalog/mapper/CatalogMapper.java", backendRoot);
    const taxonomyService = read("catalog/service/CatalogTaxonomyService.java", backendRoot);

    for (const value of ["NONE", "SNEAKERS", "CLOTHING", "PHONES", "COMPUTERS", "APPLIANCES", "PERFUMES", "AUTO_PARTS", "FURNITURE", "ACCESSORIES"]) {
      assert.match(enumFile, new RegExp(`\\b${value}\\b`));
    }
    assert.match(enumFile, /Map\.entry\("SAPATILHAS", SNEAKERS\)/);
    assert.match(categoryRequest, /CatalogSpecificationTemplate specificationTemplate/);
    assert.match(taxonomyDto, /CatalogSpecificationTemplate specificationTemplate/);
    assert.match(mapper, /CatalogSpecificationTemplate\.fromStored\(category\.getSpecificationTemplate\(\)\)/);
    assert.match(taxonomyService, /value\.storedValue\(\)/);
  });

  it("backfills only known category slugs and legacy template names", () => {
    const migration = read("V20260736__backfill_catalog_category_templates.sql", migrationRoot);

    assert.match(migration, /SET specification_template = 'SNEAKERS'/);
    assert.match(migration, /WHERE lower\(slug\) IN \('sapatilhas', 'sneakers', 'tenis', 'calcado'\)/);
    assert.match(migration, /SET specification_template = 'APPLIANCES'/);
    assert.match(migration, /WHERE lower\(slug\) IN \('eletrodomesticos', 'electrodomesticos'\)/);
    assert.doesNotMatch(migration, /WHERE specification_template IS NULL;\s*$/);
  });

  it("renders category-specific fields instead of the generic fallback", () => {
    const view = read("components/admin/catalog-admin-view.tsx");

    assert.match(view, /key: "SNEAKERS"/);
    assert.match(view, /label: "Sapatilhas"/);
    assert.match(view, /key: "gender"/);
    assert.match(view, /key: "soleType"/);
    assert.match(view, /options: \["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"\]/);
    assert.match(view, /key: "APPLIANCES"/);
    assert.match(view, /key: "power"/);
    assert.match(view, /key: "voltage"/);
    assert.match(view, /Nenhum template definido/);
    assert.match(view, /categoryTemplate\(categories, form\.categoryId\)/);
    assert.match(view, /normalizeTemplateKey\(selectedCategory\?\.specificationTemplate\)/);
    assert.match(view, /process\.env\.NODE_ENV !== "development"/);
  });

  it("keeps the requested Portuguese UI strings encoded as UTF-8", () => {
    const view = read("components/admin/catalog-admin-view.tsx");

    for (const label of ["Outras especificações", "Especificações estruturadas", "Descrição completa", "Visibilidade", "Adicionar especificação"]) {
      assert.match(view, new RegExp(label));
    }
    assert.doesNotMatch(view, /Outras especificaÃ/);
    assert.doesNotMatch(view, /DescriÃ/);
  });
});
