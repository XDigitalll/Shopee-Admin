import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("external quote publish UX", () => {
  it("blocks publish through one frontend reason function", () => {
    const source = read("components/admin/external-order-quote-view.tsx");

    assert.match(source, /function getQuotePublishBlockReason\(\): string \| null/);
    assert.match(source, /const blockReason = getQuotePublishBlockReason\(\)/);
    assert.match(source, /disabled=\{!canSubmitQuote \|\| !canSendQuote\}/);
    assert.match(source, /quotePublishBlockReason/);
    assert.match(source, /quoteSendError/);
  });

  it("parses backend error payloads in quote BFF routes", () => {
    const quoteRoute = read("app/api/admin/orders/[id]/quote/route.ts");
    const sendRoute = read("app/api/admin/orders/[id]/quote/send/route.ts");

    assert.match(quoteRoute, /jsonErrorPayload\(payload, response\.status/);
    assert.match(sendRoute, /jsonErrorPayload\(payload, response\.status/);
    assert.doesNotMatch(quoteRoute, /response\.text\(\)/);
    assert.doesNotMatch(sendRoute, /response\.text\(\)/);
  });
});
