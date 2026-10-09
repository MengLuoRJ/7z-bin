import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TARGETS, planRelease, verifyAsset, updateBinaries, getPackageVersion, updateReadme } from "./update-bin.mjs";

import { verifyBinaryVersion } from "./verify-package.mjs";

test("version check accepts Linux and Windows banners and rejects mismatches", () => {
  for (const banner of [
    "\n7-Zip (z) 26.04 (x64) : Copyright (c) 1999-2026 Igor Pavlov\n",
    "\n7-Zip 26.04 (x64) : Copyright (c) 1999-2026 Igor Pavlov\n",
  ]) {
    assert.doesNotThrow(() => verifyBinaryVersion(banner, "26.04", "binary"));
    assert.throws(() => verifyBinaryVersion(banner, "25.01", "binary"), /Binary version mismatch/);
  }
  assert.throws(() => verifyBinaryVersion("7-Zip (z) 26.040 (x64)", "26.04", "binary"));
  assert.throws(() => verifyBinaryVersion("unrecognized header", "26.04", "binary"));
  assert.throws(() => verifyBinaryVersion("7-Zip 26.04", undefined, "binary"));
});

const names = ["7z2604-x64.exe", "7z2604.exe", "7z2604-arm64.exe", "7z2604-arm.exe",
  "7z2604-mac.tar.xz", ...["x64", "x86", "arm64", "arm"].map((arch) => `7z2604-linux-${arch}.tar.xz`)];
const release = () => ({ tag_name: "26.04", published_at: "2026-10-06T07:55:39Z", assets: names.map((name) => ({ name, size: 4,
  browser_download_url: `https://github.com/ip7z/7zip/releases/download/26.04/${name}` })) });

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "7z-bin-test-"));
  try {
    await writeFile(join(root, "README.md"), "## Package Version\n\n| Package | Binary |\n| :--- | :--- |\n| 7z-bin@0.0.8 | 7-Zip@24.09 (2024-11-29) |\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "7z-bin", version: "0.0.8", scripts: { build: "tsdown" } }, null, 2) + "\n");
    await mkdir(join(root, "bin", "mac"), { recursive: true });
    await writeFile(join(root, "bin", "mac", "7zz"), "legacy");
    await fn(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

function dependencies(overrides = {}) {
  let downloads = 0;
  return {
    release: release(),
    download: async () => { downloads++; return Buffer.from("data"); },
    extract: async (_archive, directory, target) => {
      await mkdir(directory, { recursive: true });
      for (const name of target.files) {
        await writeFile(join(directory, name), "NEW!");
      }
    },
    count: () => downloads,
    ...overrides,
  };
}

test("all ten targets resolve, sharing one Mac asset", () => {
  const plan = planRelease(release());
  assert.equal(plan.length, 10);
  assert.equal(new Set(plan.map((item) => item.asset.name)).size, 9);
});

test("missing, duplicate, mismatched and nonstable assets are rejected", () => {
  for (const change of [
    (r) => r.assets.pop(),
    (r) => r.assets.push(r.assets[0]),
    (r) => { r.assets[0].browser_download_url = "https://example.com/file"; },
    (r) => { r.tag_name = "25.01"; },
    (r) => { r.prerelease = true; },
  ]) {
    const r = release(); change(r);
    assert.throws(() => planRelease(r));
  }
});

test("download size and available checksum must match", () => {
  assert.throws(() => verifyAsset({ name: "asset", size: 5 }, Buffer.from("data")));
  assert.throws(() => verifyAsset({ name: "asset", size: 4, digest: `sha256:${"0".repeat(64)}` }, Buffer.from("data")));
});

test("updates same-sized files, writes stable metadata, repairs corruption and permissions", () => fixture(async (root) => {
  await mkdir(join(root, "bin", "win", "x64"), { recursive: true });
  const binary = join(root, "bin", "win", "x64", "7z.exe");
  await writeFile(binary, "OLD!");
  const deps = dependencies();
  assert.equal((await updateBinaries({ root, ...deps })).changed, true);
  assert.equal(deps.count(), 9);
  assert.equal(await readFile(binary, "utf8"), "NEW!");
  await assert.rejects(stat(join(root, "bin", "mac", "7zz")), { code: "ENOENT" });
  const version = await readFile(join(root, "bin", "version.json"), "utf8");
  assert.equal(JSON.parse(version).files.length, TARGETS.reduce((n, t) => n + t.files.length, 0));
  assert.equal(JSON.parse(version).date, "2026-10-06");
  assert.equal((await updateBinaries({ root, ...dependencies() })).changed, false);
  assert.equal(await readFile(join(root, "bin", "version.json"), "utf8"), version);
  await writeFile(binary, "BAD!");
  const executable = join(root, "bin", "linux", "x64", "7zzs");
  await chmod(executable, 0o644);
  assert.equal((await updateBinaries({ root, ...dependencies() })).changed, true);
  assert.equal(await readFile(binary, "utf8"), "NEW!");
  if (process.platform !== "win32") assert.equal((await stat(executable)).mode & 0o777, 0o755);
  await rm(join(root, "bin", "version.json"));
  assert.equal((await updateBinaries({ root, ...dependencies() })).changed, true);
}));

test("missing mapped file leaves the repository untouched", () => fixture(async (root) => {
  const deps = dependencies();
  const original = deps.extract;
  deps.extract = async (archive, directory, target) => {
    await original(archive, directory, target);
    if (target.directory === "linux/arm") await rm(join(directory, "7zzs"));
  };
  await assert.rejects(updateBinaries({ root, ...deps }));
  assert.equal(await readFile(join(root, "bin", "mac", "7zz"), "utf8"), "legacy");
  await assert.rejects(stat(join(root, "bin", "win")), { code: "ENOENT" });
  await assert.rejects(stat(join(root, "bin", "version.json")), { code: "ENOENT" });
}));

test("failed downloads and invalid release dates leave the repository untouched", () => fixture(async (root) => {
  await assert.rejects(updateBinaries({ root, ...dependencies({ download: async () => { throw new Error("offline"); } }) }));
  const deps = dependencies();
  deps.release.published_at = "invalid date";
  await assert.rejects(updateBinaries({ root, ...deps }));
  assert.equal(await readFile(join(root, "bin", "mac", "7zz"), "utf8"), "legacy");
}));

test("package versions normalize leading zeros", () => {
  assert.equal(getPackageVersion("26.04"), "26.4.0");
  assert.equal(getPackageVersion("24.00"), "24.0.0");
  assert.throws(() => getPackageVersion("26.4"));
});

test("updates package metadata and removes previously installed documentation", () => fixture(async (root) => {
  for (const target of TARGETS) {
    assert.ok(!target.files.includes("History.txt"));
    assert.ok(!target.files.includes("readme.txt"));
    const directory = join(root, "bin", target.directory);
    await mkdir(directory, { recursive: true });
    for (const name of ["History.txt", "readme.txt"]) await writeFile(join(directory, name), "old");
  }
  const result = await updateBinaries({ root, ...dependencies() });
  assert.equal(result.packageVersion, "26.4.0");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.version, "26.4.0");
  assert.deepEqual(pkg.scripts, { build: "tsdown" });
  assert.match(await readFile(join(root, "README.md"), "utf8"), /7z-bin@26\.4\.0/);
  for (const target of TARGETS) {
    for (const name of ["History.txt", "readme.txt"]) {
      await assert.rejects(stat(join(root, "bin", target.directory, name)), { code: "ENOENT" });
    }
    assert.equal(await readFile(join(root, "bin", target.directory, "License.txt"), "utf8"), "NEW!");
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ ...pkg, version: "0.0.8" }));
  assert.equal((await updateBinaries({ root, ...dependencies() })).changed, true);
  assert.equal(JSON.parse(await readFile(join(root, "package.json"), "utf8")).version, "26.4.0");
}));

test("README version updates prepend a row and preserve history and surrounding sections", () => {
  for (const newline of ["\n", "\r\n"]) {
    const history = [
      "| 7z-bin@0.0.8 | 7-Zip@24.09 (2024-11-29) |",
      "| 7z-bin@0.0.3 | 7-Zip@24.08 (2024-08-11) |",
    ].join(newline);
    const prefix = ["# Package", "", "## Package Version", "", "| Package | Binary |", "| :--- | :--- |", ""].join(newline);
    const suffix = newline + newline + "## License" + newline + "Unchanged content" + newline;
    const original = prefix + history + suffix;
    const row = "| 7z-bin@26.4.0 | 7-Zip@26.04 (2026-10-06) |";
    const updated = updateReadme(original, "26.04", "2026-10-06");
    assert.equal(updated, prefix + row + newline + history + suffix);
    assert.equal(updateReadme(updated, "26.04", "2026-10-07"), updated);
    assert.throws(() => updateReadme("## License" + newline + history, "26.04", "2026-10-06"));
    assert.throws(() => updateReadme("## Package Version" + newline + "## License" + newline + history, "26.04", "2026-10-06"));
  }
});

test("README does not duplicate an existing version below a newer row", () => {
  const content = "## Package Version\n\n| Package | Binary |\n| --- | --- |\n" +
    "| 7z-bin@26.5.0 | 7-Zip@26.05 (2026-11-01) |\n" +
    "| 7z-bin@26.4.0 | 7-Zip@26.04 (2026-10-06) |\n";
  assert.equal(updateReadme(content, "26.04", "2026-10-06"), content);
});
