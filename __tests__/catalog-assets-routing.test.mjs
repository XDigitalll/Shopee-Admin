import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.resolve(adminRoot, "../Xdigital/src/main/java/xdigital/shopee");

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("catalog asset upload routing", () => {
  it("keeps catalog BFF multipart forwarding generic and streaming-safe", () => {
    const route = read(adminRoot, "app/api/admin/catalog/[...path]/route.ts");

    assert.match(route, /\/admin\/catalog\/\$\{suffix\}\$\{search\}/);
    assert.match(route, /init\.body\s*=\s*request\.body/);
    assert.match(route, /init\.duplex\s*=\s*"half"/);
  });

  it("exposes a backend catalog assets endpoint with validated asset types", () => {
    const controller = read(backendRoot, "catalog/controller/CatalogAdminController.java");
    const service = read(backendRoot, "catalog/service/CatalogAssetService.java");
    const security = read(backendRoot, "Security/SecurityConfig.java");

    assert.match(controller, /@PostMapping\(value = "\/assets"/);
    assert.match(controller, /@RequestPart\("file"\) MultipartFile file/);
    assert.match(service, /BRAND\("brands"\)/);
    assert.match(service, /PROMOTION\("promotions"\)/);
    assert.match(service, /fileSignatureValidator\.validateImage\(file\)/);
    assert.match(security, /"\/admin\/catalog\/\*\*"/);
  });
});
