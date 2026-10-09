import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPackageVersion } from "./update-bin.mjs";

const source = (await readFile(new URL("./publish-npm.mjs", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace('const root = join(import.meta.dirname, "..");', "");
const execute = new (Object.getPrototypeOf(async function() {}).constructor)(
  "assert", "execFileSync", "readFile", "rm", "join", "getPackageVersion", "createHash", "root", "process", source);

for (const scenario of ["dry-run", "publish", "wrong-version", "corrupt-file"]) {
  test(`publish script: ${scenario}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "7z-publish-test-"));
    try {
      await mkdir(join(root, "bin"));
      await writeFile(join(root, "package.json"), JSON.stringify({ name: "7z-bin", version: "26.4.0" }));
      await writeFile(join(root, "bin", "file"), scenario === "corrupt-file" ? "corrupt" : "data");
      await writeFile(join(root, "bin", "version.json"), JSON.stringify({ version: "26.04", packageVersion: "26.4.0",
        files: [{ path: "file", sha256: createHash("sha256").update("data").digest("hex") }] }));
      const calls = [];
      const npm = (_command, args) => {
        calls.push(args);
        if (args[0] === "pack") return JSON.stringify([{ filename: "7z-bin-26.4.0.tgz", files: [
          "package.json", "dist/index.mjs", "dist/index.cjs", "dist/index.d.mts", "dist/index.d.cts", "dist/7x.sh", "bin/version.json", "bin/file",
        ].map((path) => ({ path })) }]);
        return "mock publish succeeded";
      };
      const promise = execute(assert, npm, readFile, rm, join, getPackageVersion, createHash, root, { env: {
        EXPECTED_VERSION: scenario === "wrong-version" ? "26.5.0" : "26.4.0", DRY_RUN: scenario === "publish" ? "false" : "true",
      } });
      if (["wrong-version", "corrupt-file"].includes(scenario)) {
        await assert.rejects(promise);
        assert.equal(calls.length, 0);
      } else {
        await promise;
        assert.equal(calls.length, 2);
        assert.ok(calls[1].includes(scenario === "publish" ? "--provenance" : "--dry-run"));
        assert.equal(calls[1][1], join(root, "7z-bin-26.4.0.tgz"));
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
