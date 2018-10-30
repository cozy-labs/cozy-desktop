#!/bin/bash

set -ex

export DISPLAY=:99.0
if [ "${TRAVIS_OS_NAME}" == "osx" ]; then
  ( sudo Xvfb :99 -ac -screen 0 1024x768x8; echo ok )&
else
  sh -e /etc/init.d/xvfb start;
fi
sleep 3 # give xvfb some time to start
