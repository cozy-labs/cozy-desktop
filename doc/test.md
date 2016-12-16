Tests
=====

Make sure to have dev dependencies installed:

```bash
npm install
```

We use [`mocha`][1] for testing cozy-desktop, the options are in
[`test/mocha.opt`][2].

There are several levels of tests.


Unit tests
----------

For testing a class in isolation, method per method:

```bash
npm run test-unit
```


Integration tests
-----------------

:warning: **Important**: the integration tests remove all the files and folders
on the Cozy! We recommend using the default repository with
`COZY_DESKTOP_DIR=tmp`.

Integration tests require that you have the Cozy dev VM up (it means CouchDB, a
data-system and a proxy up and running) and that the files application is
accessible on the 9121 port. It's also expected that a user is registered with
the [test password](../test/helpers/password.coffee).

To test the communication between cozy-desktop and a remote cozy stack (proxy,
data-system, files, etc.)

```bash
COZY_DESKTOP_DIR=tmp npm run test-integration
```


Options
-------

It's possible to launch unit and integration tests:

```bash
COZY_DESKTOP_DIR=tmp npm test
```

To run a specific set of tests (here testing pouch)

```bash
NODE_ENV=test node_modules/.bin/mocha test/unit/pouch.coffee
```

For more logs you can activate debug logs:

```bash
DEBUG=true COZY_DESKTOP_DIR=tmp npm run test
```


[1]:  https://mochajs.org/
[2]:  ../test/mocha.opts
