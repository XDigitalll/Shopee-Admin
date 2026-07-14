import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "shopee-client");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("catalog order idempotency path", () => {
  it("forwards the browser key unchanged through the BFF", () => {
    const proxy = read("app/api/xdigital/[...path]/route.ts");
    assert.match(proxy, /request\.headers\.get\("Idempotency-Key"\)/);
    assert.match(proxy, /headers\.set\("Idempotency-Key", idempotencyKey\)/);
    assert.match(proxy, /IDEMPOTENCY_KEY_REQUIRED/);
    assert.doesNotMatch(proxy, /randomUUID/);
  });

  it("uses synchronous submission protection and preserves the key on failure", () => {
    const page = read("app/(client)/store/[id]/page.tsx");
    assert.match(page, /catalogSubmittingRef\.current/);
    assert.match(page, /catalogOrderKeyRef\.current \|\|= crypto\.randomUUID\(\)/);
    assert.match(page, /headers: \{ "Idempotency-Key": catalogOrderKeyRef\.current \}/);
    const catchBlock = page.slice(page.indexOf("} catch (err)"), page.indexOf("return;", page.indexOf("} catch (err)")));
    assert.doesNotMatch(catchBlock, /catalogOrderKeyRef\.current = null/);
    assert.match(page, /router\.push\(order\.paymentUrl/);
  });
});
