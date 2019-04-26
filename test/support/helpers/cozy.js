/* @flow */
/* eslint-env mocha */

const CozyClient = require('cozy-client-js').Client

const {
  FILES_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID
} = require('../../../core/remote/constants')
const Builders = require('../builders')

// The URL of the Cozy instance used for tests
const COZY_URL = process.env.COZY_URL || 'http://cozy.tools:8080'

if (!process.env.COZY_STACK_TOKEN) {
  const domain = COZY_URL.replace('http://', '')
  console.log(
    'COZY_STACK_TOKEN is missing. You can generate it with this command:'
  )
  console.log(
    `export COZY_CLIENT_ID=$(cozy-stack instances client-oauth "${domain}" http://localhost/ test github.com/cozy-labs/cozy-desktop)`
  )
  console.log(
    `export COZY_STACK_TOKEN=$(cozy-stack instances token-oauth "${domain}" "$COZY_CLIENT_ID" io.cozy.files)`
  )
  console.log(' ')
  throw new Error('No COZY_STACK_TOKEN')
}

// A cozy-client-js instance
const cozy = new CozyClient({
  cozyURL: COZY_URL,
  token: process.env.COZY_STACK_TOKEN
})

// Facade for all the test data builders
const builders = new Builders({ cozy })

module.exports = {
  COZY_URL,
  cozy,
  builders,
  deleteAll,
  createTheCouchdbFolder
}

// List files and directories in the root directory
async function rootDirContents() {
  const index = await cozy.data.defineIndex(FILES_DOCTYPE, ['dir_id'])
  const remoteDocs = await cozy.data.query(index, {
    selector: {
      dir_id: ROOT_DIR_ID,
      $not: { _id: TRASH_DIR_ID }
    },
    fields: ['_id', 'dir_id']
  })

  return remoteDocs
}

// Delete all files and directories
async function deleteAll() {
  const remoteDocs = await rootDirContents()

  await Promise.all(remoteDocs.map(doc => cozy.files.trashById(doc._id)))

  return cozy.files.clearTrash()
}

// Creates a root directory named 'couchdb-folder', used in a lot of v2 tests.
//
// TODO: Use test data builders instead
async function createTheCouchdbFolder() {
  await builders
    .remoteDir()
    .name('couchdb-folder')
    .inRootDir()
    .create()
}
