
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],

  platform: "node",
  target: "node24",

  format: ["esm", "cjs"],
  fixedExtension: true,

  dts: true,

  minify: true,

  outDir: "dist",
  clean: true,

  copy: [
    {
      from: "src/7x.sh",
      to: "dist",
    },
  ],
});
