# [Cozy](http://cozy.io) Desktop

The Cozy desktop app allows to sync the files stored in your Cozy with your laptop
and/or your desktop. It replicates your files on your hard drive and apply
changes you made on them on other synced devices and on your online Cozy.


## CLI Install

The cozy-desktop requires node.js and build tools to run

    sudo apt-get install nodejs-legacy build-essential

Then you can install it via NPM:

    sudo npm install cozy-desktop -g


## CLI Running

```bash
# Configure it with your remote Cozy
cozy-desktop add-remote-cozy http://url.of.my.cozy devicename /sync/directory

# Then start synchronization daemon:
cozy-desktop sync
```

Other commands can be listed with

    cozy-desktop -h


## GUI running

The Graphical User Interface requires Node Webkit to be launched. It should be
available in your dev dependencies. You can install it with the following
commmands:

    cd cozy-desktop
    npm install

Once done, you can launch nodewebkit in the current directory

    node_modules/.bin/nw

**Note:** On Ubuntu 13.04+, Fedora 18+, ArchLinux and Gentoo, you will run
into a `libudev.so.0` issue. See
https://github.com/rogerwang/node-webkit/wiki/The-solution-of-lacking-libudev.so.0
for more information.

If you made a modification in the code and you want to recompile `.coffee` files,
run:

    node_modules/.bin/gulp scripts  # Compiles backend files
    cd client
    npm install
    npm install -g brunch
    brunch build                    # Compiles client files


### GUI package building

If you want to build the GUI package, you will need `rubygems` and the `fpm`
gem:

    sudo apt-get install ruby-dev build-essential  # On Ubuntu/Debian
    sudo gem install fpm
    gulp build-gui-package

To make a package for your platform, choose either:

    node_modules/.bin/gulp make-deb-32
    node_modules/.bin/gulp make-deb-64
    node_modules/.bin/gulp make-rpm-32 # require the 'npm' package installed
    node_modules/.bin/gulp make-rpm-64 # require the 'npm' package installed
    node_modules/.bin/gulp make-osx-app


## Hack

To hack the synchronization backend, you can just edit the files under the
`backend` directory. Remove the `*.js` files if necessary, then run the
`bin/cli.coffee` file.

### Tests

[![Build
Status](https://travis-ci.org/cozy-labs/cozy-desktop.png?branch=master)](https://travis-ci.org/cozy-labs/cozy-desktop)

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
