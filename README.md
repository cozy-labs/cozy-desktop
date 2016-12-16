[Cozy][0] Desktop <sup>(beta)</sup>
====================================

[![Build Status][1]][2]

| library / CLI                  | GUI                            |
| ------------------------------ | ------------------------------ |
| [![Dependency Status][15]][16] | [![Dependency Status][17]][18] |

The Cozy desktop app allows to sync the files stored in your Cozy with your
laptop and/or your desktop. It replicates your files on your hard drive and
apply changes you made on them on other synced devices and on your online Cozy.

**Note**: this is currently a **beta** for Linux. We plan to add support for
OSX and Windows in the coming weeks. Stay tuned!

:warning: **Backup your data before playing with cozy-desktop!**


GUI Install
-----------

Follow the instructions on https://docs.cozy.io/en/mobile/desktop.html


CLI Install
-----------

The cozy-desktop requires node.js (4 recommended, but it is tested on 0.10 and
6 too) and build tools.

For example, you can install them on debian with:

```bash
sudo apt-get install nodejs-legacy build-essential npm
```

Then you can install cozy-desktop via NPM:

```bash
sudo npm install cozy-desktop -g
```

Note: if you see a warning about `fsevents` and you are not on OSX, you can
safely ignore it. `fsevents` is an optional dependency that is only used on
OSX.


CLI Running
-----------

Configure it with your remote Cozy and your local directory:

```bash
cozy-desktop add-remote-cozy https://url.of.my.cozy/ ~/cozy
```

It will synchronize your local directory `~/cozy` with your remote cozy.

Then start synchronization daemon:

```bash
cozy-desktop sync
```

Other commands can be listed with

```bash
cozy-desktop -h
```


Advanced use cases
------------------

It's possible to make cozy-desktop ignore some files and folders by using a
`.cozyignore` file. It works pretty much like a `.gitignore`, ie you put
patterns in this file to ignore. The rules for patterns are the same, so you
can look at
[git documentation](https://git-scm.com/docs/gitignore/#_pattern_format) to
see for their format. For example:

```bash
*.mp4
heavy-*
/tmp
```

Cozy-desktop keeps the metadata in a pouchdb database. If you want to use
several synchronized directories, you'll have to tell cozy-desktop to keeps
its metadata database somewhere else. The `COZY_DESKTOP_DIR` env variable has
this role.

For example, if you want to add a second synchronized directory, you can do:

```bash
export COZY_DESKTOP_DIR=/sync/other
cozy-desktop add-remote-cozy https://url.of.my.others.cozy/ /sync/other
cozy-desktop sync
```


Limitations
-----------

Cozy-desktop is designed to synchronize files and folders between a remote
cozy instance and a local hard drive, for a personal usage. We tried to make
it simple and easy. So, it has some limitations:

- It's only a command-line interface and it is tested only on Linux for the
  moment. We are working to improve this in the next weeks.

- Files and folders named like this are ignored:
  - `.cozy-desktop` (they are used to keep internal state)
  - `_design` (special meaning for pouchdb/couchdb)

- It's not a particularly good idea to share code with cozy-desktop:
  - `node_modules` have tons of small files
  - compiled code often has to be recompile to works on another environment
  - git and other VCS are not meant to be share like this. You may lose your
    work if you make changes on two laptops synchronized by cozy-desktop (it's
    the same with [dropbox][4], [google-drive][5], [syncthing][6], etc.)

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


Development documentation
-------------------------

You can read more documentation for developer:

 - [App design][12]
 - [Tests][14]
 - [Tools for debugging][11]
 - [How to increase the number of inotify watches][13]


## License

Cozy Desktop Client is developed by Cozy Cloud and distributed under the AGPL
v3 license.


## What is Cozy?

![Cozy Logo][7]

[Cozy][0] is a platform that brings all your web services in the same private
space.  With it, your web apps and your devices can share data easily,
providing you with a new experience. You can install Cozy on your own hardware
where no one profiles you.


## Community

You can reach the Cozy Community by:

* Chatting with us on IRC #cozycloud on irc.freenode.net
* Posting on our [Forum][8]
* Posting issues on the [Github repos][9]
* Mentioning us on [Twitter][10]

[0]:  https://cozy.io
[1]:  https://travis-ci.org/cozy-labs/cozy-desktop.svg?branch=master
[2]:  https://travis-ci.org/cozy-labs/cozy-desktop/branches
[4]:  https://github.com/anishathalye/git-remote-dropbox#faq
[5]:  https://stackoverflow.com/questions/31984751/google-drive-can-corrupt-repositories-in-github-desktop
[6]:  https://forum.syncthing.net/t/is-putting-a-git-workspace-in-a-synced-folder-really-a-good-idea/1774
[7]:  https://raw.github.com/cozy/cozy-setup/gh-pages/assets/images/happycloud.png
[8]:  https://forum.cozy.io
[9]:  https://github.com/cozy/
[10]: https://twitter.com/mycozycloud
[11]: doc/debug.md
[12]: doc/design.md
[13]: doc/inotify.md
[14]: doc/test.md
[15]: https://www.versioneye.com/user/projects/58541beead9aa20037389fff/badge.svg?style=flat-square
[16]: https://www.versioneye.com/user/projects/58541beead9aa20037389fff?child=summary#tab-dependencies
[17]: https://www.versioneye.com/user/projects/58541bf34d6466004c28cc09/badge.svg?style=flat-square
[18]: https://www.versioneye.com/user/projects/58541bf34d6466004c28cc09
