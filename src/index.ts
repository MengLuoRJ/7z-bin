"use strict";

import { join } from "path";

function getPath() {
  if (process.env.USE_SYSTEM_7ZA === "true") {
    return "7z";
  }

  if (process.platform === "darwin") {
    return join(__dirname, "lib", "mac", "7zz");
  } else if (process.platform === "win32") {
    return join(__dirname, "lib", "win", process.arch, "7z.exe");
  } else {
    return join(__dirname, "lib", "linux", process.arch, "7zz");
  }
}

export const path7z = getPath();
export const path7x = join(__dirname, "7x.sh");
