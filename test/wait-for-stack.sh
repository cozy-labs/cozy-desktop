#!/bin/sh
# Wait for the test cozy-stack to be ready, then create the test OAuth client.
# Bounded so a broken stack fails fast with its logs instead of hanging the job.
#
# - Docker mode (macOS CI, container twake-desktop-stack): runs setup.sh in the
#   container, which writes .env.test through the volume mount.
# - Native mode (Linux CI, cozy-stack serve on host): creates the instance and
#   exports the OAuth credentials to $GITHUB_ENV.
#
# The container is restarted a bounded number of times when it stops: a boot
# race between CouchDB and cozy-stack (409 conflict on the global db init)
# crashes the stack fatally, and a second start on a settled CouchDB succeeds.
set -u

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^twake-desktop-stack$'; then
  mode=docker
  max_attempts=60
  pause=5
  max_restarts=3
else
  mode=native
  max_attempts=120
  pause=1
fi

attempts=0
restarts=0

fail() {
  echo "cozy-stack not ready after $((attempts * pause))s ($mode mode), last logs:" >&2
  if [ "$mode" = docker ]; then
    docker logs --tail 100 twake-desktop-stack >&2 || true
  else
    tail -n 100 cozy-stack.log >&2 || true
  fi
  exit 1
}

if [ "$mode" = docker ]; then
  until docker exec twake-desktop-stack /twake-desktop/test/setup.sh; do
    attempts=$((attempts + 1))
    [ "$attempts" -ge "$max_attempts" ] && fail
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^twake-desktop-stack$'; then
      restarts=$((restarts + 1))
      [ "$restarts" -ge "$max_restarts" ] && fail
      echo "cozy-stack container stopped, restarting ($restarts/$max_restarts)..."
      docker start twake-desktop-stack || fail
    fi
    echo "Waiting for cozy-stack to be running..."
    sleep "$pause"
  done
else
  until cozy-stack instances add --passphrase "$COZY_PASSPHRASE" "$COZY_DOMAIN"; do
    attempts=$((attempts + 1))
    [ "$attempts" -ge "$max_attempts" ] && fail
    echo "Waiting for cozy-stack to be running..."
    sleep "$pause"
  done

  COZY_CLIENT_ID=$(
    cozy-stack instances client-oauth "$COZY_DOMAIN" http://localhost/ test github.com/cozy-labs/cozy-desktop
  ) || fail
  echo "COZY_CLIENT_ID=$COZY_CLIENT_ID" >>"$GITHUB_ENV"

  COZY_STACK_TOKEN=$(
    cozy-stack instances token-oauth "$COZY_DOMAIN" "$COZY_CLIENT_ID" io.cozy.files io.cozy.settings
  ) || fail
  echo "COZY_STACK_TOKEN=$COZY_STACK_TOKEN" >>"$GITHUB_ENV"
fi
