import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { writeFileSync } from "node:fs";

const source = readFileSync(join(process.cwd(), "lib/admin/specification-parser.ts"), "utf8")
  .replace(/export function mergeSpecificationRows[\s\S]*?\n\}/g, "")
  .replace(/export type ParsedSpecificationRow = \{[\s\S]*?\};\n/g, "")
  .replace(/export type DuplicateResolution = [^\n]+;\n/g, "")
  .replace(/<T extends \{ id: string; key: string; value: string \}>/g, "")
  .replace(/<T extends \{ id: string; key: string; value: string \}>/g, "")
  .replace(/: string\[\]/g, "")
  .replace(/: string/g, "")
  .replace(/: boolean/g, "")
  .replace(/: ParsedSpecificationRow\[\]/g, "")
  .replace(/: DuplicateResolution/g, "")
  .replace(/: \"append\" \| \"replaceAll\"/g, "")
  .replace(/ as T/g, "")
  .replace(/: T/g, "")
  .replace(/currentRows, incomingRows, mode, duplicateResolution\)\s*\{/g, "currentRows, incomingRows, mode, duplicateResolution) {")
  .replace(/filter\(\(row\): row is NonNullable<ReturnType<typeof splitSpecLine>> => Boolean\(row\)\)/g, "filter(Boolean)");

const modulePath = join(tmpdir(), `specification-parser-${Date.now()}.mjs`);
writeFileSync(modulePath, source);
const parser = await import(pathToFileURL(modulePath).href);

test("parse with colon", () => {
  const rows = parser.parseSpecificationBlock("Marca: Sony");
  assert.equal(rows[0].attribute, "Marca");
  assert.equal(rows[0].value, "Sony");
});

test("parse with dash", () => {
  const rows = parser.parseSpecificationBlock("Modelo - PS5 Slim");
  assert.equal(rows[0].attribute, "Modelo");
  assert.equal(rows[0].value, "PS5 Slim");
});

test("parse with equals", () => {
  const rows = parser.parseSpecificationBlock("Armazenamento = 1TB SSD");
  assert.equal(rows[0].attribute, "Armazenamento");
  assert.equal(rows[0].value, "1TB SSD");
});

test("parse with tab", () => {
  const rows = parser.parseSpecificationBlock("Marca\tSony");
  assert.equal(rows[0].attribute, "Marca");
  assert.equal(rows[0].value, "Sony");
});

test("parse with bullets", () => {
  const rows = parser.parseSpecificationBlock("• Cor: Branco\n- Marca: Sony\n* Modelo: PS5");
  assert.deepEqual(rows.map((row) => row.attribute), ["Cor", "Marca", "Modelo"]);
});

test("ignore empty lines", () => {
  const rows = parser.parseSpecificationBlock("\n\nMarca: Sony\n\n");
  assert.equal(rows.length, 1);
});

test("detect duplicates", () => {
  const rows = parser.parseSpecificationBlock("Marca: Sony", ["marca"]);
  assert.equal(rows[0].duplicate, true);
});

test("remove html and scripts", () => {
  const rows = parser.parseSpecificationBlock("<script>alert(1)</script><b>Marca</b>: Sony");
  assert.equal(rows[0].attribute, "Marca");
  assert.equal(rows[0].value, "Sony");
});
