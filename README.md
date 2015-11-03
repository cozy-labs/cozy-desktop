# [Cozy](http://cozy.io) Desktop

The Cozy desktop app allows to sync the files stored in your Cozy with your laptop
and/or your desktop. It replicates your files on your hard drive and apply
changes you made on them on other synced devices and on your online Cozy.

**Note**: the code is currently alpha quality and there is only a readonly
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
