# 7z-bin ![NPM Version](https://img.shields.io/npm/v/7z-bin?link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F7z-bin)

7z-bin contains full featured 7-Zip precompiled binaries, which means `7z.exe` and `7zz`.

As this package will contain `7z.exe`, `7z.dll` and `7zz`, it means its size is larger than any other packages containing `7za`, please refer to the [Defferences](#differences-between-7zz-and-7za) section below before using, to consider to choose this package or other packages like [`7zip-bin`](https://github.com/develar/7zip-bin) within smaller size `7za` binaries.

## Environment Variables

- `USE_SYSTEM_7Z`: set to use `7z` from current system instead of the binaries in this packages.
- `SZ_COMPRESSION_LEVEL`: set the compression level for 7z archive. The default value is `9`.

## Package Version

| `7z-bin` package version | `7-Zip` binaries veriosn |
| :----------------------- | :----------------------- |
| 7z-bin@0.0.8            | 7-Zip@24.09 (2024-11-29) |
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

## License

This repository is licensed under the [MIT License](LICENSE).

This repository was forked from [7zip-bin](https://github.com/develar/7zip-bin), licensed under the [MIT License](https://github.com/develar/7zip-bin/blob/master/LICENSE.txt).

This repository contains 7-Zip binaries from [7-Zip](https://www.7-zip.org/), licensed under [7-Zip License for use and distribution](https://www.7-zip.org/license.txt)
