import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { getPackageVersion } from "./update-bin.mjs";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "bin", "version.json"), "utf8"));
assert.equal(pkg.name, "7z-bin", "Unexpected package name");
assert.equal(pkg.version, getPackageVersion(manifest.version), "Package and bundled 7-Zip versions differ");
assert.equal(manifest.packageVersion, pkg.version, "Binary manifest package version differs");
assert.ok(["true", "false"].includes(process.env.DRY_RUN), "DRY_RUN must be true or false");
for (const file of manifest.files) {
  const content = await readFile(join(root, "bin", file.path));
  assert.equal(createHash("sha256").update(content).digest("hex"), file.sha256,
    `Bundled file checksum mismatch: ${file.path}`);
}

const run = (args) => execFileSync("npm", args, { cwd: root, encoding: "utf8" });
const [pack] = JSON.parse(run(["pack", "--json", "--ignore-scripts"]));
const archive = join(root, pack.filename);
try {
  const files = new Set(pack.files.map((file) => file.path));
  for (const name of ["package.json", "dist/index.mjs", "dist/index.cjs", "dist/index.d.mts", "dist/index.d.cts", "dist/7x.sh", "bin/version.json",
    ...manifest.files.map((file) => `bin/${file.path}`)]) {
    assert.ok(files.has(name), `Missing packed file: ${name}`);
  }
  for (const name of files) {
    assert.ok(!/^bin\/.*\/(?:History\.txt|readme\.txt)$/i.test(name), `Unexpected bundled document: ${name}`);
  }
  const dryRun = process.env.DRY_RUN === "true";
  console.log(`${dryRun ? "Validating" : "Staging"} ${pkg.name}@${pkg.version}; archive=${pack.filename}`);
  const args = dryRun ? ["publish", archive, "--dry-run"] : ["stage", "publish", archive, "--provenance"];
  args.push("--access", "public", "--tag", "latest", "--ignore-scripts", "--registry", "https://registry.npmjs.org");
  console.log(run(args));
  console.log(dryRun
    ? "Dry-run complete. No package was uploaded."
    : "Package staged, not publicly released. Review it in npm Staged Packages and approve with 2FA.");
} finally {
  await rm(archive, { force: true });
}
