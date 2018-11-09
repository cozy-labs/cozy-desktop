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

if [ "$TRAVIS_PULL_REQUEST" != "false" ]; then
    version=$(git rev-parse --short HEAD);
    bintray_version="PR-$TRAVIS_PULL_REQUEST";
    dist_files=$(ls -p dist/ | grep -v /);

    IFS=$'\n'
    for file in $dist_files; do
      bintray_path="$version-${file/ /%20}";
      curl -u "$BINTRAY_USER:$BINTRAY_API_TOKEN" \
           -T "dist/$file" \
           "https://api.bintray.com/content/$BINTRAY_ORG/$BINTRAY_REPO/$BINTRAY_PACKAGE/$bintray_version/$bintray_path?publish=1&override=1";
    done
    unset IFS
fi
