# Workflow

```
cli.coffee add-remote-cozy http://url.of.my.cozy devicename /sync/directory
cli.coffee sync

# Or

build/cli.js sync
```

# TODO

* Investigate on pouchDB listener limit error
* Handle conflicts properly
* Allow files to be added locally while downloading binary from remote

# How to run node-webkit application

1. Download [node-webkit](https://github.com/rogerwang/node-webkit#downloads)
2. unpack downlaoded archive
2. On Ubuntu fix [the libudev
   issue](https://github.com/rogerwang/node-webkit/wiki/The-solution-of-lacking-libudev.so.0)
4. In your cozy-data-proxy root folder run:

    path/to/node-webkit/nw .
