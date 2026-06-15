import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("delivery active queue filtering", () => {
  it("does not classify READY_FOR_DELIVERY as active delivery", () => {
    const shared = read("app/api/admin/delivery/_shared.ts");
    const activeSetMatch = shared.match(/const ACTIVE_DELIVERY_STATUSES = new Set\(\[(.*?)\]\);/s);

    assert.ok(activeSetMatch, "ACTIVE_DELIVERY_STATUSES must be declared");
    assert.match(activeSetMatch[1], /"OUT_FOR_DELIVERY"/);
    assert.match(activeSetMatch[1], /"AWAITING_DELIVERY_PAYMENT"/);
    assert.doesNotMatch(activeSetMatch[1], /"READY_FOR_DELIVERY"/);
  });

  it("filters backend active-delivery responses before mapping", () => {
    const shared = read("app/api/admin/delivery/_shared.ts");
    const activeFetch = shared.slice(
      shared.indexOf("export async function fetchActiveDeliveryOrders"),
      shared.indexOf("function mergeActiveOrders"),
    );

    assert.match(activeFetch, /list\s*\n\s*\.filter\(\(order\) => ACTIVE_DELIVERY_STATUSES\.has\(readString\(order\.status\)\)\)/);
    assert.match(activeFetch, /\.map\(mapActiveOrder\)/);
  });
});
