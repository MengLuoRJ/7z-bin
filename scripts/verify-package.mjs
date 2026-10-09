import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export function verifyBinaryVersion(output, expectedVersion, binaryPath) {
  assert.match(expectedVersion || "", /^\d{2}\.\d{2}$/, "Expected a YY.NN release version");
  const match = output.match(/^7-Zip(?:\s+\([^\r\n)]+\))?\s+(\d+\.\d+)(?=\s|$)/m);
  assert.equal(match?.[1], expectedVersion,
    `Binary version mismatch: expected ${expectedVersion}, got ${match?.[1] ?? "unrecognized banner"}; binary: ${binaryPath}\n${output}`);
}

async function main() {
  const esm = await import("../dist/index.mjs");
  const cjs = createRequire(import.meta.url)("../dist/index.cjs");
  for (const [format, entry] of [["ESM", esm], ["CJS", cjs]]) {
    assert.ok(existsSync(entry.path7z), `${format} binary is missing: ${entry.path7z}`);
    assert.ok(existsSync(entry.path7x), `${format} helper is missing: ${entry.path7x}`);
  }
  assert.equal(esm.path7z, cjs.path7z, "ESM/CJS binary paths differ");
  assert.equal(esm.path7x, cjs.path7x, "ESM/CJS helper paths differ");
  const output = execFileSync(esm.path7z, [], { encoding: "utf8", timeout: 30_000 });
  verifyBinaryVersion(output, process.env.VERSION, esm.path7z);
  console.log(`Verified ESM/CJS package entries and 7-Zip ${process.env.VERSION}: ${esm.path7z}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
