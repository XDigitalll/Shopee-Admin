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

describe("client home catalog choices", () => {
  it("renders ShopeeMz choices as a separate home section after local products", () => {
    const source = readClient("app/page.tsx");

    assert.match(source, /catalogImage, fetchCatalogProducts, fetchFeaturedCatalogProducts/);
    assert.match(source, /function CatalogHomeCard\(\{ product \}: \{ product: CatalogProduct \}\)/);
    assert.match(source, /ESCOLHAS DA SHOPEEMZ/);
    assert.match(source, /Produtos selecionados para encomenda/);
    assert.match(source, /Compra produtos escolhidos pela ShopeeMz com preço final em Meticais\./);
    assert.match(source, /Ver todas as Escolhas/);
    assert.match(source, /Ver produto/);
    assert.match(source, /href=\{`\/catalogo\/\$\{product\.slug\}`\}/);
    assert.doesNotMatch(source, /CatalogGrid/);
    assert.doesNotMatch(source, /CatalogOrderButton/);

    const productsIndex = source.indexOf("<ProductsSection");
    const choicesIndex = source.indexOf("<ShopeeChoicesSection");
    assert.ok(productsIndex > -1, "ProductsSection should be rendered on the home page");
    assert.ok(choicesIndex > productsIndex, "Shopee choices should be rendered after local products");
  });

  it("hides unavailable choices and falls back to recommended catalog products", () => {
    const source = readClient("app/page.tsx");
    const cardStart = source.indexOf("function CatalogHomeCard");
    const cardEnd = source.indexOf("function ShopeeChoicesSection");
    const cardSource = source.slice(cardStart, cardEnd);

    assert.match(source, /function getHomeChoiceProducts\(products: CatalogProduct\[\]\)/);
    assert.match(source, /catalogImage\(product\) && Number\(product\.finalPrice\) > 0/);
    assert.match(source, /if \(error\) \{\s*return null;\s*\}/);
    assert.match(source, /if \(!loading && products\.length === 0\) \{\s*return null;\s*\}/);
    assert.match(source, /const fallback = await fetchCatalogProducts\(params\)/);
    assert.match(source, /\.filter\(\(product\) => product\.recommended\)/);
    assert.doesNotMatch(cardSource, /Carrinho/);
  });
});
