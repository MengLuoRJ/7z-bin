import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPOSITORY = "ip7z/7zip";
const DOCUMENTS = ["History.txt", "License.txt", "readme.txt"];
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

export const TARGETS = [
  ...["x64", "ia32", "arm64", "arm"].map((arch) => ({
    directory: `win/${arch}`,
    pattern: new RegExp(`^7z\\d+${arch === "ia32" ? "" : `-${arch}`}\\.exe$`),
    files: ["7z.exe", "7z.dll", ...DOCUMENTS],
    type: "exe",
  })),
  ...["x64", "arm64"].map((arch) => ({
    directory: `mac/${arch}`,
    pattern: /^7z\d+-mac\.tar\.xz$/,
    files: ["7zz", ...DOCUMENTS],
    type: "tar",
  })),
  ...["x64", "ia32", "arm64", "arm"].map((arch) => ({
    directory: `linux/${arch}`,
    pattern: new RegExp(`^7z\\d+-linux-${arch === "ia32" ? "x86" : arch}\\.tar\\.xz$`),
    files: ["7zz", "7zzs", ...DOCUMENTS],
    type: "tar",
  })),
];

export function planRelease(release) {
  if (release.draft || release.prerelease || !/^\d{2}\.\d{2}$/.test(release.tag_name)) {
    throw new Error("Expected a stable 7-Zip release with a YY.NN tag");
  }
  if (!Array.isArray(release.assets)) throw new Error("Release assets are missing");
  const versionDigits = release.tag_name.replace(".", "");
  return TARGETS.map((target) => {
    const matches = release.assets.filter((asset) => target.pattern.test(asset.name));
    if (matches.length !== 1) throw new Error(`Expected exactly one asset for ${target.directory}`);
    const asset = matches[0];
    if (!asset.name.startsWith(`7z${versionDigits}`)) throw new Error(`Asset version mismatch: ${asset.name}`);
    const url = new URL(asset.browser_download_url);
    if (url.origin !== "https://github.com" ||
        url.pathname !== `/${REPOSITORY}/releases/download/${release.tag_name}/${asset.name}`) {
      throw new Error(`Unexpected asset URL: ${asset.name}`);
    }
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error(`Invalid asset size: ${asset.name}`);
    if (asset.digest != null && !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) {
      throw new Error(`Unsupported asset digest: ${asset.name}`);
    }
    return { ...target, asset };
  });
}

export async function request(url, { token, fetchImpl = fetch } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const headers = { "User-Agent": "7z-bin-updater" };
      if (token) {
        headers.Accept = "application/vnd.github+json";
        headers.Authorization = "Bearer " + token;
      }
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

export function verifyAsset(asset, content) {
  if (content.length !== asset.size) throw new Error(`Download size mismatch: ${asset.name}`);
  const digest = sha256(content);
  if (asset.digest && asset.digest !== `sha256:${digest}`) {
    throw new Error(`Download checksum mismatch: ${asset.name}`);
  }
  return digest;
}

export async function extractArchive(archive, directory, target) {
  await mkdir(directory, { recursive: true });
  const options = { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 };
  if (target.type === "exe") {
    await exec(process.env.SEVEN_ZIP || "7zz", ["x", archive, `-o${directory}`, "-y", "-bd", ...target.files], options);
  } else {
    await exec("tar", ["-xJf", archive, "-C", directory, "--", ...target.files], options);
  }
}

export async function collectFiles(directory, target) {
  const files = [];
  for (const name of target.files) {
    const path = join(directory, name);
    const info = await lstat(path);
    if (!info.isFile() || info.size === 0) throw new Error(`Missing or invalid file: ${target.directory}/${name}`);
    files.push({ path: `${target.directory}/${name}`, content: await readFile(path),
      executable: name === "7zz" || name === "7zzs" });
  }
  return files;
}

export function getReleaseDate(files, version) {
  const dates = files.filter((file) => file.path.endsWith("/History.txt")).map((file) => {
    const match = file.content.toString("utf8").match(new RegExp(`^${version.replace(".", "\\.")}\\s+(\\d{4}-\\d{2}-\\d{2})(?:\\s|$)`, "m"));
    if (!match) throw new Error(`Release date not found: ${file.path}`);
    return match[1];
  });
  if (dates.length !== TARGETS.length || new Set(dates).size !== 1) throw new Error("Inconsistent release dates");
  return dates[0];
}

export async function writeIfChanged(path, content, executable = false) {
  let existing;
  let info;
  try {
    info = await lstat(path);
    if (!info.isFile()) throw new Error(`Expected a regular file: ${path}`);
    existing = await readFile(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let changed = !existing?.equals(content);
  if (changed) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  if (executable) {
    if (process.platform !== "win32" && (info?.mode & 0o777) !== 0o755) changed = true;
    await chmod(path, 0o755);
  }
  return changed;
}

export function updateReadme(content, version, date) {
  const pattern = /^(\| 7z-bin@[^|\r\n]+\|\s*)7-Zip@[^|\r\n]+(\|)/m;
  if (!pattern.test(content)) throw new Error("README package version table was not found");
  return content.replace(pattern, (_, lead, tail) => `${lead}7-Zip@${version} (${date}) ${tail}`);
}

export async function updateBinaries({ root = ROOT, release, download = request, extract = extractArchive } = {}) {
  const plan = planRelease(release);
  const work = await mkdtemp(join(tmpdir(), "7z-bin-update-"));
  try {
    const files = [];
    const assets = new Map();
    for (const target of plan) {
      let cached = assets.get(target.asset.name);
      if (!cached) {
        console.log(`Downloading ${target.asset.name}`);
        const content = await download(target.asset.browser_download_url);
        const digest = verifyAsset(target.asset, content);
        const archive = join(work, target.asset.name);
        const directory = join(work, `${target.asset.name}-extracted`);
        await writeFile(archive, content);
        await extract(archive, directory, target);
        cached = { directory, digest };
        assets.set(target.asset.name, cached);
      }
      files.push(...await collectFiles(cached.directory, target));
    }
    const date = getReleaseDate(files, release.tag_name);
    const readmePath = join(root, "README.md");
    const readme = updateReadme(await readFile(readmePath, "utf8"), release.tag_name, date);
    const manifest = {
      version: release.tag_name,
      date,
      releaseUrl: `https://github.com/${REPOSITORY}/releases/tag/${release.tag_name}`,
      assets: [...assets].map(([name, { digest }]) => ({ name, sha256: digest })),
      files: files.map((file) => ({ path: file.path, sha256: sha256(file.content) })),
    };
    // Do not touch the repository until every archive, mapped file and metadata has passed validation.
    let changed = false;
    for (const file of files) {
      changed = await writeIfChanged(join(root, "bin", file.path), file.content, file.executable) || changed;
    }
    for (const legacy of ["mac/7zz", "mac/License.txt", "linux/License.txt", "win/License.txt"]) {
      const path = join(root, "bin", legacy);
      try {
        await lstat(path);
        await rm(path);
        changed = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    changed = await writeIfChanged(readmePath, Buffer.from(readme)) || changed;
    changed = await writeIfChanged(join(root, "bin", "version.json"), Buffer.from(JSON.stringify(manifest, null, 2) + "\n")) || changed;
    return { changed, version: release.tag_name, date, releaseUrl: manifest.releaseUrl };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function main() {
  const release = JSON.parse((await request(`https://api.github.com/repos/${REPOSITORY}/releases/latest`,
    { token: process.env.GITHUB_TOKEN })).toString("utf8"));
  const result = await updateBinaries({ release });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(""));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
