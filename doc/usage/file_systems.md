# File Systems

The app currently makes the following assumptions:

- NTFS is used on Windows
- APFS or HFS+ is used on macOS
- EXT4 is used on GNU/Linux

On those 3 platforms, using a file system with similar path restrictions, case
and unicode normalization sensitivity as the assumed one(s) may work (e.g.
using EXT3 on GNU/Linux should work although we don't officially support it).

On other platforms, using a file system with similar path restrictions, case
and unicode normalization sensitivity as EXT4 should work too (e.g. using EXT4
on BSD should work too).

Please note that all FAT versions are currently unsupported.

In case you're successfully using another platform (e.g. some BSD flavor), or
GNU/Linux with another file system than EXT4 (e.g. BTRFS or ZFS), your
feedback is welcome!

## File System / Platform Matrix

| File System | Platform      | Status |
| ----------- | ------------- | ------ |
| APFS        | **macOS**     | **supported, actively tested** |
| EXT3/EXT2   | GNU/Linux     | should work |
| EXT4        | **GNU/Linux** | **supported, actively tested** |
| FAT         |               | won't work |
| HFS+        | **macOS**     | **supported, testing should be back soon** |
| HFS+        | GNU/Linux     | won't work |
| NTFS        | **Windows**   | **supported, actively tested** |
| NTFS        | GNU/Linux     | won't work |
| [Add your file system / platform][Edit] | | |

[Edit]: https://github.com/cozy-labs/cozy-desktop/edit/master/doc/usage/file_systems.md
