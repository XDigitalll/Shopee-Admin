import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("admin customer detail exposes WhatsApp identity fields", () => {
  const detailPage = read("app/admin/(protected)/customers/[id]/page.tsx");
  const types = read("lib/admin/types.ts");
  const route = read("app/api/admin/customers/route.ts");

  for (const field of [
    "whatsappPhoneNumber",
    "whatsappVerified",
    "whatsappOptIn",
    "lastWhatsappInteractionAt",
    "preferredContactChannel",
    "customerCode",
  ]) {
    assert.match(types, new RegExp(field));
    assert.match(route, new RegExp(field));
  }

  assert.match(detailPage, /Telefone principal/);
  assert.match(detailPage, /WhatsApp associado/);
  assert.match(detailPage, /Canal preferido/);
  assert.match(detailPage, /WhatsApp preparado/);
  assert.match(detailPage, /Hist[óo]rico WhatsApp/);
  assert.match(detailPage, /Sem intera[çc][õo]es registadas por enquanto/);
});
