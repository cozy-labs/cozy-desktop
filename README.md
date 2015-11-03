# [Cozy](http://cozy.io) Desktop

The Cozy desktop app allows to sync the files stored in your Cozy with your laptop
and/or your desktop. It replicates your files on your hard drive and apply
changes you made on them on other synced devices and on your online Cozy.

**Note**: the code is currently **alpha** quality and there is only a readonly
mode (files from the cozy are replicated to the local hard drive). But it's
moving fast and we plan to do a more stable release in the coming weeks. Stay
tuned!


## CLI Install

The cozy-desktop requires node.js (at least version 0.10) and build tools.
For example, you can install them on debian with:

    sudo apt-get install nodejs-legacy build-essential

Then you can install cozy-desktop via NPM:

    sudo npm install cozy-desktop -g


### CLI Running

Configure it with your remote Cozy

    cozy-desktop add-remote-cozy https://url.of.my.cozy/ devicename /sync/directory

Then start synchronization daemon:

    cozy-desktop sync

Other commands can be listed with

    cozy-desktop -h


## Hack

To hack the synchronization backend, you can just edit the files under the
`backend` directory. Remove the `*.js` files if necessary, then run the
`bin/cli.coffee` file.

### Tests

[![Build Status](https://travis-ci.org/cozy-labs/cozy-desktop.png?branch=master)
](https://travis-ci.org/cozy-labs/cozy-desktop)

There are several levels of tests in cozy-desktop:

- unit tests, for testing a class in isolation, method per method
- functional tests, for testing a behaviour that requires the collaboration of
  several classes, but still in a mock environment
- integration tests, to test the communication between cozy-desktop and a
  remote cozy stack (proxy, data-system, files, etc.)

Unit and functional tests are easy to launch:

```
# Make sure to have dev dependencies installed
npm install

# Then run tests via gulp
node_modules/.bin/gulp test

# To run a specific set of tests (here testing local_watcher with DEBUG activated)
npm install -g mocha
DEBUG=true DEFAULT_DIR=tmp mocha --compilers coffee:coffee-script/register tests/unit/pouch.coffee

# Or, if you want pouchdb to be really verbose
DEBUG=pouchdb:api DEFAULT_DIR=tmp mocha --compilers coffee:coffee-script/register tests/unit/pouch.coffee
```

Integration tests require that you have the Cozy dev VM up (it means a
data-system and a proxy up and running) and that the files application is
accessible on the 9121 port. It's also expected that a user is registered with
`cozytest` as password.

```
DEFAULT_DIR=tmp mocha --compilers coffee:coffee-script/register tests/integration/*.coffee
```


## Limitations

Cozy-desktop is designed to synchronize files and folders between a remote
cozy instance and a local hard drive, for a personal usage. We tried to make
it simple and easy. So, it has some limitations:

- It's only a command-line interface and it works only on Linux for the
  moment. We are working to improve this in the next weeks.

- It's all or nothing for files and folders to synchronize, but we have on our
  roadmap to add a mean to select which files and folders to synchronize.

- Files and folders named like this are ignored:
  - `.cozy-desktop` (they are used to keep internal state)
  - `_design` (special meaning for pouchdb/couchdb)

- It's not a particularly good idea to share code with cozy-desktop:
  - `node_modules` can't be ignored for the moment and have tons of small files
  - compiled code often has to be recompile to works on another environment
  - git and other VCS are not meant to be share like this. You may lose your
    work if you make changes on two laptops synchronized by cozy-desktop (it's
    the same with
    [dropbox](https://github.com/anishathalye/git-remote-dropbox#faq),
    [google-drive](https://stackoverflow.com/questions/31984751/google-drive-can-corrupt-repositories-in-github-desktop),
    [syncthing](https://forum.syncthing.net/t/is-putting-a-git-workspace-in-a-synced-folder-really-a-good-idea/1774),
    etc.)

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


## What is Cozy?

![Cozy Logo](https://raw.github.com/cozy/cozy-setup/gh-pages/assets/images/happycloud.png)

[Cozy](http://cozy.io) is a platform that brings all your web services in the
same private space.  With it, your web apps and your devices can share data
easily, providing you
with a new experience. You can install Cozy on your own hardware where no one
profiles you.


## Community

You can reach the Cozy Community by:

* Chatting with us on IRC #cozycloud on irc.freenode.net
* Posting on our [Forum](https://forum.cozy.io)
* Posting issues on the [Github repos](https://github.com/cozy/)
* Mentioning us on [Twitter](http://twitter.com/mycozycloud)
