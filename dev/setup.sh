#!/bin/sh

set -x

# Generate development env file
cat >${ENVFILE:-$(dirname $0)/../.env.dev} <<EOF
COZY_DESKTOP_DIR=$PWD/tmp
COZY_DESKTOP_HEARTBEAT=1000
DEBUG=1
EOF
