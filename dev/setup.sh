#!/bin/sh

set -x

# Generate development env file
cat >${ENVFILE:-$(dirname $0)/../.env.dev} <<EOF
COZY_DESKTOP_DIR=tmp
COZY_DESKTOP_HEARTBEAT=1000
DEBUG=1
EOF

# Install cozy apps
apt-get update
apt-get install -y --no-install-recommends git
for app in home settings drive photos collect; do
  cozy-stack apps install "$app"
done
