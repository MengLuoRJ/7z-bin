import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { getPackageVersion } from "./update-bin.mjs";

const exec = promisify(execFile);

export async function preparePackage(root, destination) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(root, "bin", "version.json"), "utf8"));
  assert.equal(pkg.name, "7z-bin", "Unexpected source package name");
  assert.equal(pkg.version, getPackageVersion(manifest.version), "Package and binary versions differ");
  assert.equal(manifest.packageVersion, pkg.version, "Manifest package version differs");
  for (const file of manifest.files) {
    const content = await readFile(join(root, "bin", file.path));
    assert.equal(createHash("sha256").update(content).digest("hex"), file.sha256,
      `Bundled file checksum mismatch: ${file.path}`);
  }
  for (const name of ["bin", "dist", "README.md", "LICENSE"]) {
    await cp(join(root, name), join(destination, name), { recursive: true });
  }
  pkg.name = "@mengluorj/7z-bin";
  pkg.repository = { type: "git", url: "https://github.com/MengLuoRJ/7z-bin" };
  pkg.publishConfig = { registry: "https://npm.pkg.github.com", tag: "latest" };
  delete pkg.scripts;
  await writeFile(join(destination, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  return { pkg, manifest };
}

async function main() {
  assert.ok(["true", "false"].includes(process.env.DRY_RUN), "DRY_RUN must be true or false");
  const directory = await mkdtemp(join(tmpdir(), "7z-github-publish-"));
  try {
    const { pkg, manifest } = await preparePackage(join(import.meta.dirname, ".."), directory);
    const run = async (args) => (await exec("npm", args, { cwd: directory, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })).stdout;
    const [pack] = JSON.parse(await run(["pack", "--json", "--ignore-scripts"]));
    assert.equal(pack.name, pkg.name);
    assert.equal(pack.version, pkg.version);
    assert.ok(pack.size < 256 * 1024 * 1024, "GitHub Packages tarball size limit exceeded");
    const names = new Set(pack.files.map((file) => file.path));
    for (const name of ["package.json", "dist/index.mjs", "dist/index.cjs", "dist/index.d.mts", "dist/index.d.cts", "dist/7x.sh", "bin/version.json",
      ...manifest.files.map((file) => `bin/${file.path}`)]) {
      assert.ok(names.has(name), `Missing packed file: ${name}`);
    }
    for (const name of names) {
      assert.ok(!/^bin\/.*\/(?:History\.txt|readme\.txt)$/i.test(name), `Unexpected bundled document: ${name}`);
    }
    const args = ["publish", join(directory, pack.filename), "--ignore-scripts", "--registry", "https://npm.pkg.github.com", "--tag", "latest", "--provenance=false"];
    if (process.env.DRY_RUN === "true") args.push("--dry-run");
    console.log(`GitHub Packages: ${pkg.name}@${pkg.version}; dry-run=${process.env.DRY_RUN}`);
    console.log(await run(args));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
