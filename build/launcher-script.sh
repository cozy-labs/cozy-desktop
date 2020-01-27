#!/usr/bin/env bash

# Uncomment for debugging purposes:
# set -eux

APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RESOURCES_DIR="$APP_DIR/resources"
DESKTOP_DATABASE_DIR="$HOME/.local/share/applications"
MIME_DATABASE_DIR="$HOME/.local/share/mime"
CUSTOM_MIME_DIR="$MIME_DATABASE_DIR/packages"
COZY_NOTE_MIME_TYPE_DECLARATION_FILENAME="vnd.cozy.note+markdown.xml"

function isCozyNoteMimeTypeDeclared() {
    # does our MIME type declaration file exist in the MIME database folder?
    [[ -f "$CUSTOM_MIME_DIR/$COZY_NOTE_MIME_TYPE_DECLARATION_FILENAME" ]] && return

    false
}

function declareCozyNoteMimeType() {
    # make sure the `packages` folder exists
    mkdir -p "$CUSTOM_MIME_DIR"
    # copy our MIME type declaration file
    cp "$RESOURCES_DIR/$COZY_NOTE_MIME_TYPE_DECLARATION_FILENAME" "$CUSTOM_MIME_DIR/$COZY_NOTE_MIME_TYPE_DECLARATION_FILENAME"
    # rebuild the local MIME database to make sure our new type is known
    update-mime-database $MIME_DATABASE_DIR
}

# For Desktop to be declared as the default application to open Cozy Notes on
# linux, we need to declare the custom MIME type via an xml file in the system
# or local MIME database folder.
# We chose the local database at `~/.local/share/mime` since it doesn't require
# root priviledges.
#
# To avoid overwriting modifications made by the user to the type once declared,
# we don't overwrite the file if it exists.
if ! isCozyNoteMimeTypeDeclared; then
    declareCozyNoteMimeType
fi

UNPRIVILEGED_USERNS_ENABLED=$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)

# The Chromium app included in recent electron releases use a new kernel feature
# to manage sandboxes and those electron releases also forcibly enable the usage
# of sandboxes.
# However, this feature called "unprivileged user namespaces" is considered a
# security risk by Debian and so the feature is disabled on Debian and all other
# distributions using its custom kernel.
# This prevents the app from starting and so the only way for our users to use
# Cozy Desktop is for us to manually disable the Chromium sandbox at runtime.
exec "$APP_DIR/cozydrive-bin" "$([[ $UNPRIVILEGED_USERNS_ENABLED == 0 ]] && echo '--no-sandbox')" "$@"
