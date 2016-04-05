[Cozy][0] Desktop GUI <sup>(alpha)</sup>
========================================

The Cozy desktop app allows to sync the files stored in your Cozy with your
laptop and/or your desktop. It replicates your files on your hard drive and
apply changes you made on them on other synced devices and on your online Cozy.

**Note**: the code is currently **alpha** quality. But it's moving fast and we
plan to do a more stable release in the coming weeks. Stay tuned!

:warning: **Backup your data before playing with cozy-desktop!**

This repository is for the graphical interface of cozy-desktop, built with
[Electron][8] and [Elm][9].


## Limitations

Cozy-desktop is designed to synchronize files and folders between a remote
cozy instance and a local hard drive, for a personal usage. We tried to make
it simple and easy. So, it has some limitations:

- Files and folders named like this are ignored:
  - `.cozy-desktop` (they are used to keep internal state)
  - `_design` (special meaning for pouchdb/couchdb)

- It's not a particularly good idea to share code with cozy-desktop:
  - `node_modules` have tons of small files
  - compiled code often has to be recompile to works on another environment
  - git and other VCS are not meant to be share like this. You may lose your
    work if you make changes on two laptops synchronized by cozy-desktop (it's
    the same with [dropbox][1], [google-drive][2], [syncthing][3], etc.)

- If the same file has been modified in parallel, cozy-desktop don't try to
  merge the modifications. It will just rename of one the copies with a
  `-conflict` suffix. It's the same for folders.

- We expect a personal usage:
  - a reasonable number of files and folders (< 1.000.000)
  - a reasonable number of files per folder (< 10.000)
  - a reasonable size for files (< 1 To)
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


## Hack

First, you need to build cozy-desktop in the parent directory with `npm run
build`.

Electron is based on node 5 and npm 3. So, it's better to install the
`node_modules` in `gui` with a node 5 and npm 3:

```sh
cd gui
npm install -g node-gyp
npm install
elm-package install
npm run build
```

Then, you launch the GUI with `npm run start`.

You have also `npm run watch` that will run the lint on JS files and compile
the Elm and Stylus stuff when a change is made.


## License

Cozy Desktop Client is developed by Cozy Cloud and distributed under the AGPL
v3 license.


## What is Cozy?

![Cozy Logo][4]

[Cozy][0] is a platform that brings all your web services in the same private
space.  With it, your web apps and your devices can share data easily,
providing you with a new experience. You can install Cozy on your own hardware
where no one profiles you.


## Community

You can reach the Cozy Community by:

* Chatting with us on IRC #cozycloud on irc.freenode.net
* Posting on our [Forum][5]
* Posting issues on the [Github repos][6]
* Mentioning us on [Twitter][7]

[0]: https://cozy.io
[1]: https://github.com/anishathalye/git-remote-dropbox#faq
[2]: https://stackoverflow.com/questions/31984751/google-drive-can-corrupt-repositories-in-github-desktop
[3]: https://forum.syncthing.net/t/is-putting-a-git-workspace-in-a-synced-folder-really-a-good-idea/1774
[4]: https://raw.github.com/cozy/cozy-setup/gh-pages/assets/images/happycloud.png
[5]: https://forum.cozy.io
[6]: https://github.com/cozy/
[7]: https://twitter.com/mycozycloud
[8]: http://electron.atom.io/
[9]: http://elm-lang.org/
