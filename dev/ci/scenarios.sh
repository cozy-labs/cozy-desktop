#!/bin/bash

set -ex

. "./dev/ci/start_xvfb.sh"

# FIXME Scenario tests use ChokidarEvents and onFlush
# So, they are not yet compatible with atom/watcher
export COZY_FS_WATCHER=chokidar

yarn install:electron
yarn test:scenarios --timeout $MOCHA_TIMEOUT --forbid-only
