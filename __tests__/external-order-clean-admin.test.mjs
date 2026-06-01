import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("admin external order clean input display", () => {
  const shared = read("../app/api/admin/orders/[id]/_shared.ts");
  const types = read("../lib/admin/types.ts");
  const detail = read("../components/admin/order-detail-view.tsx");
  const quote = read("../components/admin/external-order-quote-view.tsx");

  it("maps clean parser fields from backend detail", () => {
    for (const field of [
      "originalRawMessage",
      "cleanDescription",
      "cleanedTitle",
      "detectedLinks",
      "promotionalTextRemoved",
    ]) {
      assert.ok(shared.includes(field), `missing mapper field ${field}`);
      assert.ok(types.includes(field), `missing type field ${field}`);
    }
  });

  it("shows clean description as primary and raw message only expandable", () => {
    assert.ok(detail.includes("detail.cleanDescription || detail.productDetails"));
    assert.ok(quote.includes("detail.cleanDescription || detail.productDetails"));
    assert.ok(detail.includes("Ver mensagem original"));
    assert.ok(quote.includes("Ver mensagem original"));
  });
});
