#!/usr/bin/env node
//
// This script can launch the fauxton UI for debug.
// It does the following:
//   - launch an in-memory pouchdb server
//   - replicate the local pouchdb file to the pouchdb server
//   - open the fauxton UI on the pouchdb server
//
// It's your job to kill the pouchdb-server when you have finished!

import PouchDB from 'pouchdb'
import path from 'path'
import os from 'os'
import Config from '../config'
import helpers from '../../test/helpers/v2/couch'

helpers.startServer(function (err) {
  if (err) {
    console.log(err)
    process.exit(1)
  }
  console.log(`Pouchdb-server pid is ${helpers.server.pid}`)
  helpers.server.on('close', () => process.exit(0))
  let basePath = process.env.COZY_DESKTOP_DIR || os.homedir()
  basePath = path.join(basePath, '.cozy-desktop')
  let config = new Config(basePath)
  return PouchDB.replicate(config.dbPath, `${helpers.url}/${helpers.params.db}`)
    .on('error', err => console.log(err))
    .on('complete', info => console.log(`Replication done, you can open ${helpers.url}/_utils`))
})
