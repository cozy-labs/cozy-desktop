#!/bin/bash

set -ex

. "./dev/ci/start_xvfb.sh"

yarn install:all
yarn build:elm
yarn lint
yarn test:elm
if [ "$TRAVIS_OS_NAME" == "linux" ]; then
	yarn test:unit:coverage --timeout $MOCHA_TIMEOUT --forbid-only
	bash <(curl -s https://codecov.io/bash)
else
	yarn test:unit --timeout $MOCHA_TIMEOUT --forbid-only
fi
yarn test:world --timeout $MOCHA_TIMEOUT --forbid-only
yarn test:integration --timeout $MOCHA_TIMEOUT --forbid-only
