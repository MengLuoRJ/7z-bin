import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePackage } from "./publish-github.mjs";

for (const scenario of ["valid", "wrong-version", "corrupt-file"]) {
  test(`GitHub package preparation: ${scenario}`, async () => {
    const temp = await mkdtemp(join(tmpdir(), "7z-github-test-"));
    try {
      const root = join(temp, "source");
      const destination = join(temp, "publish");
      await mkdir(join(root, "bin"), { recursive: true });
      await mkdir(join(root, "dist"));
      await mkdir(destination);
      const pkg = { name: "7z-bin", version: scenario === "wrong-version" ? "26.5.0" : "26.4.0",
        scripts: { prepublish: "npm run build" }, files: ["bin", "dist"], exports: { ".": "./dist/index.mjs" } };
      const original = JSON.stringify(pkg);
      await writeFile(join(root, "package.json"), original);
      await writeFile(join(root, "README.md"), "readme");
      await writeFile(join(root, "LICENSE"), "license");
      await writeFile(join(root, "bin", "file"), scenario === "corrupt-file" ? "broken" : "data");
      await writeFile(join(root, "bin", "version.json"), JSON.stringify({ version: "26.04", packageVersion: "26.4.0",
        files: [{ path: "file", sha256: createHash("sha256").update("data").digest("hex") }] }));
      if (scenario !== "valid") {
        await assert.rejects(preparePackage(root, destination));
      } else {
        const { pkg: prepared } = await preparePackage(root, destination);
        assert.equal(prepared.name, "@mengluorj/7z-bin");
        assert.equal(prepared.version, "26.4.0");
        assert.equal(prepared.publishConfig.registry, "https://npm.pkg.github.com");
        assert.equal(prepared.scripts, undefined);
        assert.deepEqual(prepared.exports, pkg.exports);
        assert.equal(await readFile(join(destination, "bin", "file"), "utf8"), "data");
        assert.equal(JSON.parse(await readFile(join(destination, "package.json"), "utf8")).name, prepared.name);
      }
      assert.equal(await readFile(join(root, "package.json"), "utf8"), original);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}
