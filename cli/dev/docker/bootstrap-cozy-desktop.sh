#!/bin/sh

set -x

# Create CouchDB system tables
for table in _global_changes _metadata _replicator _users; do
  curl -X PUT http://couch:5984/$table
done

# Create cozy-stack instances
for name in "dev" "test"; do
  cozy-stack instances add \
    --dev \
    --passphrase CozyTest_1 \
    $name.cozy.tools:8080
done

# Install cozy-drive on dev instance
cozy-stack apps install files git://github.com/cozy/cozy-drive.git#build --domain dev.cozy.tools:8080

# Retrieve test client ID
client_id=$(cozy-stack instances client-oauth \
  test.cozy.tools:8080 \
  http://test.cozy.tools/ \
  test \
  github.com/cozy-labs/cozy-desktop)

# Retrieve test token
token=$(cozy-stack instances token-oauth \
  test.cozy.tools:8080 \
  "$client_id" \
  io.cozy.files)

# Generate test env file
cat >/cozy-desktop/.env.test <<EOF
COZY_CLIENT_ID=$client_id
COZY_STACK_TOKEN=$token
NODE_ENV=test
EOF
