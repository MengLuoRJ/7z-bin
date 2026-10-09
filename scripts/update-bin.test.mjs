import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TARGETS, planRelease, verifyAsset, updateBinaries } from "./update-bin.mjs";

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
const release = () => ({ tag_name: "26.04", assets: names.map((name) => ({ name, size: 4,
  browser_download_url: `https://github.com/ip7z/7zip/releases/download/26.04/${name}` })) });

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "7z-bin-test-"));
  try {
    await writeFile(join(root, "README.md"), "| 7z-bin@0.0.8 | 7-Zip@24.09 (2024-11-29) |\n");
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
        await writeFile(join(directory, name), name === "History.txt" ? "26.04  2026-10-05\n" : "NEW!");
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
  assert.equal(JSON.parse(version).date, "2026-10-05");
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
  const extract = deps.extract;
  deps.extract = async (...args) => {
    await extract(...args);
    await writeFile(join(args[1], "History.txt"), "wrong version\n");
  };
  await assert.rejects(updateBinaries({ root, ...deps }));
  assert.equal(await readFile(join(root, "bin", "mac", "7zz"), "utf8"), "legacy");
}));
