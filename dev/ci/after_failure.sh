#!/bin/bash

set -ex

netstat -lntp
if [[ "$TRAVIS_OS_NAME" == "osx" ]]; then cat couchdb.log; fi
$CC --version
$CXX --version
