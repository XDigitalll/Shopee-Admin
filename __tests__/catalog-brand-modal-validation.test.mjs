import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(adminRoot, relativePath), "utf8");
}

describe("catalog brand modal validation", () => {
  it("keeps brand descriptions longer than category descriptions without changing category limits", () => {
    const view = read("components/admin/catalog-admin-view.tsx");

    assert.match(view, /const CATEGORY_DESCRIPTION_LIMIT = 500;/);
    assert.match(view, /const BRAND_DESCRIPTION_LIMIT = 2000;/);
    assert.match(view, /maxLength=\{descriptionLimit\}/);
    assert.match(view, /catalog-taxonomy-description/);
    assert.match(view, /fieldErrors=\{taxonomyFieldErrors\}/);
  });

  it("maps backend field errors to inline feedback and focuses the invalid taxonomy field", () => {
    const view = read("components/admin/catalog-admin-view.tsx");
    const bffUtils = read("app/api/admin/_utils.ts");

    assert.match(view, /extractFieldErrors\(error\)/);
    assert.match(view, /setTaxonomyFieldErrors\(fieldErrors\)/);
    assert.match(view, /focusCatalogField\(fieldErrors\.description \? "description"/);
    assert.match(bffUtils, /const fieldErrors = body\.fieldErrors \?\? body\.messages;/);
    assert.match(bffUtils, /fieldErrors,/);
  });

  it("does not upload a brand logo before the brand save succeeds and allows retry after upload failure", () => {
    const view = read("components/admin/catalog-admin-view.tsx");
    const saveStart = view.indexOf("async function saveTaxonomy()");
    const saveEnd = view.indexOf("async function savePromotion()");
    const saveTaxonomy = view.slice(saveStart, saveEnd);
    const saveCall = saveTaxonomy.indexOf("adminApiFetch<CatalogTaxonomy>");
    const uploadCall = saveTaxonomy.indexOf('uploadCatalogAsset("BRAND"');

    assert.ok(saveStart >= 0 && saveEnd > saveStart, "saveTaxonomy should exist");
    assert.ok(saveCall >= 0, "taxonomy save should exist before logo upload");
    assert.ok(uploadCall > saveCall, "brand logo upload should happen only after successful brand save");
    assert.match(saveTaxonomy, /canRetryBrandLogoUpload/);
    assert.match(saveTaxonomy, /setTaxonomyForm\(\{ \.\.\.taxonomyForm, id: saved\.id \}\)/);
    assert.match(saveTaxonomy, /A marca foi criada, mas o logótipo não foi carregado\. Tenta novamente\./);
  });
});
