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


Coverage
--------

You can enable coverage metrics for any npm command with the
[`coverage.sh`][3] script.

Examples:

```bash
./scripts/coverage.sh npm run test
./scripts/coverage.sh npm run test-unit
```

Please note that code coverage is only measured for unit tests.
Integration tests have another purpose, so they are deliberately excluded,
even when running `./scripts/coverage.sh npm run test-integration`
explicitely.

Implementation details:

1. `coverage.sh` runs the `mocha` command with the [appropriate option][3] to load
   [`coffee-coverage`][4].
2. `coffee-coverage` inserts instrumentation code when compiling from
   CoffeeScript to JavaScript
3. The mocha tests are run and generate `coverage/coverage-coffee.json`
4. `coverage.sh` then runs [`istanbul`][5], who reads the json and turns it
   into an lcov-style report (including HTML output).
5. Finally, when run on the CI, we [tell Travis](../.travis.yml) to upload the report to the
   [Codecov][6] service.


[1]:  https://mochajs.org/
[2]:  ../test/mocha.opts
[3]: ../scripts/coverage.sh
[4]: https://github.com/benbria/coffee-coverage
[5]: https://github.com/gotwarlost/istanbul
[6]: https://codecov.io/gh/cozy-labs/cozy-desktop
