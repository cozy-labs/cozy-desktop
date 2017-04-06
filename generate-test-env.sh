#!/bin/sh
# TODO: Script with node to support Windows

client_id=$(cozy-stack instances client-oauth test.cozy-desktop.local:8080 http://test.cozy-desktop.local/ test github.com/cozy-labs/cozy-desktop)

cat >.env.test <<EOF
COZY_STACK_TOKEN=$(cozy-stack instances token-oauth test.cozy-desktop.local:8080 "$client_id" io.cozy.files)
NODE_ENV="test"
EOF
