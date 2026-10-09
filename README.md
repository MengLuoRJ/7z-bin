# 7z-bin ![NPM Version](https://img.shields.io/npm/v/7z-bin?link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F7z-bin)

7z-bin contains full featured 7-Zip precompiled binaries, which means `7z.exe` and `7zz`.

As this package will contain `7z.exe`, `7z.dll` and `7zz`, it means its size is larger than any other packages containing `7za`, please refer to the [Defferences](#differences-between-7zz-and-7za) section below before using, to consider to choose this package or other packages like [`7zip-bin`](https://github.com/develar/7zip-bin) within smaller size `7za` binaries.

## Environment Variables

- `USE_SYSTEM_7Z`: set to use `7z` from current system instead of the binaries in this packages.
- `SZ_COMPRESSION_LEVEL`: set the compression level for 7z archive. The default value is `9`.

## Package Version

| `7z-bin` package version | `7-Zip` binaries veriosn |
| :----------------------- | :----------------------- |
| 7z-bin@0.0.8             | 7-Zip@24.09 (2024-11-29) |
| 7z-bin@0.0.3             | 7-Zip@24.08 (2024-08-11) |
| 7z-bin@0.0.2             | 7-Zip@24.05 (2024-05-14) |

The changelogs of `7-Zip`, please refer to [7-Zip ChangeLog / History](https://www.7-zip.org/history.txt) and also [7-Zip](https://www.7-zip.org/) website.



## Differences between `7zz` and `7za`

These information are based on [7-Zip](https://www.7-zip.org/) website and `readme.txt` file in `7-Zip` distribution files.

### `7z.exe` / `7zz`

`7z.exe` (with `7z.dll` 7-Zip engine module) and `7zz` are the command line version of 7-Zip, having full features of 7-Zip.

Supported formats:

- Packing / unpacking: 7z, XZ, BZIP2, GZIP, TAR, ZIP and WIM.
- Unpacking only: APFS, AR, ARJ, Base64, CAB, CHM, CPIO, CramFS, DMG, EXT, FAT, GPT, HFS, IHEX, ISO, LZH, LZMA, MBR, MSI, NSIS, NTFS, QCOW2, RAR, RPM, SquashFS, UDF, UEFI, VDI, VHD, VHDX, VMDK, XAR, Z and ZSTD.

### `7za.exe` / `7za`

`7za.exe` and `7za` (a = alone) are standalone version of 7-Zip, supporting only 7z, xz, lzma, cab, zip, gzip, bzip2 and tar formats, and it doesn't use external modules.

Supported formats:

- Packing / unpacking: 7z, xz, ZIP, GZIP, BZIP2 and TAR
- Unpacking only: lzma, CAB, ZSTD.

## Automated binary updates

The **Update 7-Zip binaries** GitHub Actions workflow runs daily at 03:17 UTC
and can also be started manually from the Actions tab. It always checks out the
default branch and creates or updates a single `automation/update-7zip` pull
request; it never pushes updates directly to the default branch.

The workflow uses Node.js 24 and Ubuntu archive tools to retrieve the latest
stable release from [ip7z/7zip](https://github.com/ip7z/7zip/releases). All ten
Windows, macOS and Linux architecture targets must be present. The macOS
universal archive is downloaded once and installed in both architecture folders.
Each archive's size and upstream SHA-256 digest (when provided) are checked, and
all mapped binaries and documents must be nonempty regular files before any
repository files are updated. Release dates come from the bundled History.txt.

The updater compares file contents, restores Unix executable permissions and
records asset/file SHA-256 hashes in `bin/version.json`. Every run revalidates
the assets and repairs incomplete installations, even for an unchanged version.
The workflow rebuilds `dist` and checks the Linux x64 binary and both package
entry points before creating the PR. It does not bump the npm package version or
publish to npm; release the package separately after reviewing the update.

Enable **Allow GitHub Actions to create and approve pull requests** in the
repository's Actions settings. The workflow requires `contents: write` and
`pull-requests: write`; organization policies may restrict these permissions.
PRs created using the built-in `GITHUB_TOKEN` do not trigger ordinary
`pull_request` workflows, so validation is performed inside this workflow.

Run updater unit tests with `node --test scripts/update-bin.test.mjs`.
The updater itself is intended for this Ubuntu workflow, requires `7zz`, `tar`
and xz support, and optionally accepts `SEVEN_ZIP` as the extractor path.

## License

This repository is licensed under the [MIT License](LICENSE).

This repository was forked from [7zip-bin](https://github.com/develar/7zip-bin), licensed under the [MIT License](https://github.com/develar/7zip-bin/blob/master/LICENSE.txt).

This repository contains 7-Zip binaries from [7-Zip](https://www.7-zip.org/), licensed under [7-Zip License for use and distribution](https://www.7-zip.org/license.txt)
