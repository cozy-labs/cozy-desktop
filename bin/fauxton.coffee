#!/usr/bin/env coffee
#
# This script can launch the fauxton UI for debug.
# It does the following:
#   - launch an in-memory pouchdb server
#   - replicate the local pouchdb file to the pouchdb server
#   - open the fauxton UI on the pouchdb server
#
# It's your job to kill the pouchdb-server when you have finished!

PouchDB = require 'pouchdb'
path    = require 'path-extra'
Config  = require '../src/config'
helpers = require '../test/helpers/couch.coffee'


helpers.startServer (err) ->
    if err
        console.log err
        process.exit 1
    console.log "Pouchdb-server pid is #{helpers.server.pid}"
    helpers.server.on 'close', -> process.exit 0
    basePath = process.env.COZY_DESKTOP_DIR or path.homedir()
    basePath = path.join basePath, '.cozy-desktop'
    config = new Config basePath
    PouchDB.replicate(config.dbPath, "#{helpers.url}/#{helpers.params.db}")
        .on 'error', (err) ->
            console.log err
        .on 'complete', (info) ->
            console.log "Replication done, you can open #{helpers.url}/_utils"
