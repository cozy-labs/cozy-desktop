Limitations
-----------

Cozy-desktop is designed to synchronize files and folders between a remote
cozy instance and a local hard drive, for a personal usage. We tried to make
it simple and easy. So, it has some limitations:

- It's only a command-line interface and it is tested only on Linux for the
  moment. We are working to improve this in the next weeks.

- Files and folders named like this are ignored:
  - `.system-tmp-cozy-drive` (they are used to keep internal state)
  - `_design` (special meaning for pouchdb/couchdb)

- It's not a particularly good idea to share code with cozy-desktop:
  - `node_modules` have tons of small files
  - compiled code often has to be recompile to works on another environment
  - git (and other VCS) repositories are not meant to be shared this way.
    You may lose your work if you make changes on two laptops synchronized
    by cozy-desktop (it's the same with [dropbox][4], [google-drive][5],
    [syncthing][6], etc.)
  - `cozy-desktop` keeps the time with only a precision of a second, which may
    trigger unexpected "file changed" notifications in your editor (see
    [emacs issue](https://github.com/cozy-labs/cozy-desktop/issues/446) and
    [workaround](https://github.com/cozy-labs/cozy-desktop/issues/446#issuecomment-262239629)).


- If the same file has been modified in parallel, cozy-desktop don't try to
  merge the modifications. It will just rename of one the copies with a
  `-conflict` suffix. It's the same for folders.

- We expect a personal usage:
  - a reasonable number of files and folders (< 1.000.000)
  - a reasonable number of files per folder (< 10.000)
  - a reasonable size for files (< 1 Tb)
  - a reasonable size for files and folders path (< 1024 bytes)
  - not too many changes
  - etc.

- For OSX, filenames with weird unicode characters may be problematic in some
  rare cases.

- Symbolic links and ACL are not yet handled.

- The full sync directory must be on the same partition.

- Large files must be uploaded/downloaded in one time (we are thinking about
  making it possible to split a large file in several blocks for
  download/upload).

- Due to its nature, cozy-desktop needs resources:
  - CPU, for checksums in particular
  - RAM, to keep all the metadata in memory, and for nodejs libraries
  - Disk, but the overhead from cozy-desktop is low
  - Network bandwidth obviously

- No advanced feature, like P2P replication between several cozy-desktop
  instances.

[4]: https://github.com/anishathalye/git-remote-dropbox#faq
[5]: https://stackoverflow.com/questions/31984751/google-drive-can-corrupt-repositories-in-github-desktop
[6]: https://forum.syncthing.net/t/is-putting-a-git-workspace-in-a-synced-folder-really-a-good-idea/1774
