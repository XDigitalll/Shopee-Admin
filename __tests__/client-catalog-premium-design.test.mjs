import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.resolve(root, "..", "shopee-client");

function readClient(relativePath) {
  return fs.readFileSync(path.join(clientRoot, relativePath), "utf8");
}

describe("client catalog premium design", () => {
  it("uses the shared money format and carries catalog quantity into the order flow", () => {
    const format = readClient("lib/format.ts");
    const catalog = readClient("lib/catalog.ts");
    const externalOrder = readClient("app/(client)/orders/external/new/page.tsx");

    assert.match(format, /minimumFractionDigits: 2/);
    assert.match(format, /return `\$\{formatted\.replace\([^}]+\)\} MT`/);
    assert.match(catalog, /catalogOrderHref\(product: CatalogProduct, selectedVariants: Record<string, string> = \{\}, quantity = 1\)/);
    assert.match(catalog, /quantity: String\(Math\.max\(1, Math\.min\(20/);
    assert.match(externalOrder, /const initialQuantity = Number\(params\.get\("quantity"\) \|\| 1\)/);
    assert.match(externalOrder, /setQuantity\(Math\.min\(20, Math\.floor\(initialQuantity\)\)\)/);
  });

  it("aligns catalog cards with local product card proportions and deduplicates products", () => {
    const card = readClient("components/catalog/catalog-card.tsx");
    const home = readClient("app/page.tsx");
    const listing = readClient("app/(client)/catalogo/page.tsx");

    assert.match(card, /aspect-square/);
    assert.match(card, /Por encomenda/);
    assert.match(card, /Ver produto/);
    assert.match(card, /mt-auto pt-3/);
    assert.doesNotMatch(card, /CatalogOrderButton/);
    assert.match(home, /new Map\(products\.map\(\(product\) => \[product\.id \|\| product\.slug, product\]\)\)/);
    assert.match(listing, /new Map\(nextProducts\.map\(\(product\) => \[product\.id \|\| product\.slug, product\]\)\)/);
  });

  it("renders premium catalog detail controls, translated specs and semantic variant sorting", () => {
    const details = readClient("components/catalog/catalog-details.tsx");
    const gallery = readClient("components/catalog/catalog-gallery.tsx");
    const detailPage = readClient("app/(client)/catalogo/[slug]/page.tsx");

    assert.match(details, /const specificationLabels/);
    assert.match(details, /soleType: "Tipo de sola"/);
    assert.match(details, /function semanticSort\(values: string\[\]\)/);
    assert.match(details, /Number\(a\.replace\(",", "\."\)\)/);
    assert.match(details, /Quantidade/);
    assert.match(details, /Seleciona as opções obrigatórias|CatalogOrderButton/);
    assert.match(details, /role="tab"/);
    assert.match(details, /Ainda não existem avaliações/);
    assert.match(gallery, /aria-label="Imagem anterior"/);
    assert.match(gallery, /onPointerDown/);
    assert.match(gallery, /overflow-x-auto/);
    assert.match(detailPage, /lg:grid-cols-\[1fr_420px\] xl:grid-cols-\[1fr_460px\]/);
    assert.match(detailPage, /Tentar novamente/);
  });
});
