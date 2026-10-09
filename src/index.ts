
import { join } from "node:path";

function getPath(): string {
  if (process.env.USE_SYSTEM_7Z === "true") {
    return "7z";
  }

  const bin = join(import.meta.dirname, "..", "bin");

  if (process.platform === "win32") {
    return join(bin, "win", process.arch, "7z.exe");
  } else if (process.platform === "darwin") {
    return join(bin, "mac", process.arch, "7zz");
  } else {
    return join(bin, "linux", process.arch, "7zzs");
  }
}

export const path7z = getPath();
export const path7x = join(import.meta.dirname, "7x.sh");
