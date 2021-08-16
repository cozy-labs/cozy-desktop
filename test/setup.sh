#!/bin/sh

set -x

# Retrieve test client ID
client_id=$(cozy-stack instances client-oauth \
  cozy.localhost:8080 \
  http://cozy.localhost/ \
  test \
  github.com/cozy-labs/cozy-desktop)

# Retrieve test token
token=$(cozy-stack instances token-oauth \
  cozy.localhost:8080 \
  "$client_id" \
  io.cozy.files io.cozy.settings)

# Generate test env file
cat >${ENVFILE:-$(dirname $0)/../.env.test} <<EOF
COZY_DESKTOP_DIR=tmp
COZY_DESKTOP_HEARTBEAT=1000
COZY_CLIENT_ID=$client_id
COZY_STACK_TOKEN=$token
NODE_ENV=test
EOF
