import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("auditable order status reversal", () => {
  it("loads capability from the backend and shows the action only when allowed", () => {
    const detailView = read("components/admin/order-detail-view.tsx");

    assert.match(detailView, /OrderStatusReversalCapability/);
    assert.match(detailView, /\/api\/admin\/orders\/\$\{id\}\/status\/reversal-capability/);
    assert.match(detailView, /statusReversal\?\.allowed\s*\?/);
    assert.doesNotMatch(detailView, /targetStatus:\s*statusReversal/);
  });

  it("posts only the reason to the revert route", () => {
    const detailView = read("components/admin/order-detail-view.tsx");
    const route = read("app/api/admin/orders/[id]/status/revert/route.ts");
    const callIndex = detailView.indexOf("`/api/admin/orders/${detail.id}/status/revert`");
    assert.notEqual(callIndex, -1, "revert API call not found");
    const callSlice = detailView.slice(callIndex, callIndex + 260);

    assert.match(callSlice, /body:\s*JSON\.stringify\(\{\s*reason\s*\}\)/);
    assert.doesNotMatch(callSlice, /targetStatus|statusReversal\.targetStatus/);
    assert.match(route, /\/admin\/orders\/\$\{encodeURIComponent\(id\)\}\/status\/revert/);
  });
});
