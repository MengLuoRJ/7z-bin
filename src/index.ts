"use strict";

import { join } from "path";

function getPath() {
  if (process.env.USE_SYSTEM_7Z === "true") {
    return "7z";
  }

  const bin = join(__dirname, "..", "bin");

  if (process.platform === "win32") {
    return join(bin, "win", process.arch, "7z.exe");
  } else if (process.platform === "darwin") {
    return join(bin, "mac", "7zz");
  } else {
    return join(bin, "linux", process.arch, "7zz");
  }
}

export const path7z = getPath();
export const path7x = join(__dirname, "7x.sh");
