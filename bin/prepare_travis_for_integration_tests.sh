#!/bin/bash

set -e

cd
export CXX=g++-4.8
export INDEXES_PATH=/home/travis/build/indexes
mkdir -p $INDEXES_PATH

nvm install 0.10
nvm use 0.10
npm install forever coffee-script -g

# Data system
git clone --depth 1 git://github.com/cozy/cozy-data-system.git
cd cozy-data-system
pwd
travis_retry npm install #data-system
NAME=data-system TOKEN=token forever start -o forever-ds.log -e forever-ds-err.log build/server.js
sleep 5
cd

# Proxy
git clone --depth 1 git://github.com/cozy/cozy-proxy.git
cd cozy-proxy
pwd
travis_retry npm install #proxy
NAME=proxy TOKEN=token forever start -o forever-proxy.log -e forever-proxy-err.log build/server.js
sleep 5
curl -X POST -H "Content-Type: application/json" -d "{ \"email\": \"cozytest@cozycloud.cc\", \"password\": \"cozytest\", \"timezone\":\"Europe/Paris\"}" http://127.0.0.1:9104/register
cd

# Files
git clone --depth 1 git://github.com/cozy/cozy-files.git
cd cozy-files
pwd
travis_retry npm install #files
cd ~/cozy-data-system
coffee commands.coffee test-install files ../cozy-files/package.json
cd ~/cozy-files
NAME=files TOKEN=apptoken forever start -o forever-files.log -e forever-files-err.log build/server.js
sleep 3
