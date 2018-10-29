#!/bin/bash

set -ex

. "./dev/ci/start_xvfb.sh"

yarn test:scenarios --timeout $MOCHA_TIMEOUT --forbid-only
