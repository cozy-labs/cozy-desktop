#!/bin/bash

set -ex

. "./dev/ci/start_xvfb.sh"

yarn install:electron
yarn test:scenarios --timeout $MOCHA_TIMEOUT --forbid-only
