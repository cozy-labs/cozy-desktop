#!/bin/bash

set -ex

. "./dev/ci/start_xvfb.sh"

yarn build:elm
yarn lint
yarn test:unit
yarn test:world --timeout $MOCHA_TIMEOUT --forbid-only
yarn test:elm
yarn test:integration --timeout $MOCHA_TIMEOUT --forbid-only
