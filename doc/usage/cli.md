CLI Install
-----------

The cozy-desktop requires node.js (6 recommended, but it is tested on 4 and
7 too) and build tools.

For example, you can install them on debian with:

```bash
curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
sudo apt-get install nodejs build-essential
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
