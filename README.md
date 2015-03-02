# [Cozy](http://cozy.io) Desktop

The Cozy desktop app allows to sync the files stored in your Cozy with your laptop
and/or your desktop. It replicates your files on your hard drive and apply
changes you made on them on other synced devices and on your online Cozy.

## CLI Install

The cozy-desktop requires node.js and build tools to run

    sudo apt-get install nodejs-legacy build-essentatials

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

For an obscure reason, `leveldown` module needs to be recompiled on your platform
with `node-gyp` in order to run on Node Webkit.

    sudo npm install -g nw-gyp
    node_modules/.bin/gulp leveldown

Once done, you can launch nodewebkit in the current directory

    node_modules/nodewebkit/bin/nodewebkit .

**Note:** On Ubuntu 13.04+, Fedora 18+, ArchLinux and Gentoo, you will run
into a `libudev.so.0` issue. See https://github.com/rogerwang/node-webkit/wiki/The-solution-of-lacking-libudev.so.0
for more information.

**Note:** On Debian Wheezy (7.x) you will have to install libc6 from the
`testing` repository. Be careful, it may break other services.

    echo 'deb http://ftp.us.debian.org/debian/ testing main contrib non-free' | sudo tee -a /etc/apt/sources.list
    sudo apt-get update
    sudo apt-get install -t testing libc6

If you made a modification in the code and you want to recompile `.coffee` files,
run:

    node_modules/.bin/gulp scripts  # Compiles backend files
    cd client
    npm install
    sudo npm install -g brunch
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
`cli.coffee` file.

### Run tests

Tests require that you have the Cozy dev VM up (it means a data-system and a
proxy up and running) and that the file application is accessible on the 9121
port.

```
# Make sure to have dev dependencies installed
npm install

# Then run tests via gulp
node_modules/.bin/gulp test

# To run a specific set of tests (here testing local_watcher with DEBUG activated)
npm install -g mocha
DEBUG=true DEFAULT_DIR=tests mocha --compilers coffee:coffee-script/register tests/local_watcher.coffee
```

## What is Cozy?

![Cozy Logo](https://raw.github.com/mycozycloud/cozy-setup/gh-pages/assets/images/happycloud.png)

[Cozy](http://cozy.io) is a platform that brings all your web services in the
same private space.  With it, your web apps and your devices can share data
easily, providing you
with a new experience. You can install Cozy on your own hardware where no one
profiles you.


## Community

You can reach the Cozy Community by:

* Chatting with us on IRC #cozycloud on irc.freenode.net
* Posting on our [Forum](https://forum.cozy.io)
* Posting issues on the [Github repos](https://github.com/mycozycloud/)
* Mentioning us on [Twitter](http://twitter.com/mycozycloud)
