#!/bin/bash

# Enable job control so we can start cozy-app-dev entrypoint in background and
# bring it back in foreground.
set -m

# Install apps useful for manual testing of cozy-desktop
install_apps() {
    instance="$1"

    install_app "$instance" settings 'git://github.com/cozy/cozy-settings.git#build'
    install_app "$instance" drive 'git://github.com/cozy/cozy-drive.git#build-drive'
    install_app "$instance" photos 'git://github.com/cozy/cozy-drive.git#build-photos'
    install_app "$instance" collect 'git://github.com/cozy/cozy-collect.git#build'
}

install_app() {
    instance="$1"
    slug="$2"
    repo="$3"

    cozy-stack apps install --domain "$instance" "$slug" "$repo" >/dev/null
}

# Same as in https://github.com/cozy/cozy-stack/blob/master/scripts/cozy-app-dev.sh
wait_for() {
	i="0"
	while ! LC_NUMERIC=C curl -s --max-time 0.5 -XGET "${1}" > /dev/null; do
		sleep 0.5
		i=$((i+1))
		if [ "${i}" -gt "100" ]; then
			echo_err "could not listen to ${2} on ${1}"
			exit 1
		fi
	done
}

# Run cozy-app-dev entrypoint in background so we get a running cozy-stack
/docker-entrypoint.sh &

# Wait for the cozy-stack to be ready to install apps
# FIXME: Actually, it only wait for the cozy-stack to be listening, not for
# instances to be created, but it seems to work anyway...
wait_for localhost:8080/version/ cozy-stack

# Install apps on all instances
install_apps cozy.tools:8080
install_apps localhost:8080

# Bring back cozy-app-dev in foreground
fg
