#!/bin/sh

set -x
MOCHA_UNIT_TEST_FLAGS='--require coffee-coverage/register-istanbul' $@
./node_modules/.bin/istanbul report
