#!/bin/bash

set -ex

yarn install:all
yarn build

if [ "$TRAVIS_OS_NAME" == "linux" ]; then
  docker run --rm \
    $(env | \
      grep -Eo '^[^\s=]*(DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS|APPVEYOR_|CSC_|_TOKEN|_KEY|AWS_|STRIP|BUILD_)[^\s=]*' | \
      sed 's/^/-e /;/^$/d' | \
      paste -sd ' ' \
    ) \
    -v ${PWD}:/project \
    -v ~/.cache/electron:/root/.cache/electron \
    -v ~/.cache/electron-builder:/root/.cache/electron-builder \
    electronuserland/builder:8 \
    /bin/bash -c "yarn dist:all"
else
  yarn dist:all
fi
