#!/bin/sh
#
# Unlike mocha, electron-mocha lacks a --watch option.
# This shell script uses chokidar as a poor man's replacement.
# The `yarn mocha:watch` script makes it easier to discover.

test_cmd="yarn mocha $@"

$test_cmd
./node_modules/.bin/chokidar \
  './core/**/*.js' \
  './gui/js/**/*.js' \
  './test/support/**/*.js' \
  './test/mocha.opts' \
  $@ \
  -c "$test_cmd"
