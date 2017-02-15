/* eslint-env mocha */

import { Cozy as CozyClient } from 'cozy-client-js'

import { FILES_DOCTYPE, ROOT_DIR_ID, TRASH_DIR_ID } from '../../src/remote/constants'
import { BuilderFactory } from '../builders'

// The URL of the Cozy instance used for tests
export const COZY_URL = process.env.COZY_URL || 'http://test.cozy-desktop.local:8080'

if (!process.env.COZY_STACK_TOKEN) {
  console.log('COZY_STACK_TOKEN is missing. You can generate it with this command')
  console.log(`export COZY_STACK_TOKEN=$(cozy-stack instances token-oauth "${COZY_URL}" desktop-test io.cozy.files)`)
  throw new Error('No COZY_STACK_TOKEN')
}

// A cozy-client-js instance
export const cozy = new CozyClient({
  cozyURL: COZY_URL,
  oauth: {}
})

// FIXME: Temporary hack to make cozy-client-js think it has OAuth tokens
cozy._authstate = 3
cozy._authcreds = Promise.resolve({
  token: {
    toAuthHeader () {  'Bearer ' + process.env.COZY_STACK_TOKEN }
  }
})

// Facade for all the test data builders
export const builders = new BuilderFactory(cozy)

// List files and directories in the root directory
async function rootDirContents () {
  const index = await cozy.data.defineIndex(FILES_DOCTYPE, ['dir_id'])
  const docs = await cozy.data.query(index, {
    selector: {
      dir_id: ROOT_DIR_ID,
      '$not': {_id: TRASH_DIR_ID}
    },
    fields: ['_id', 'dir_id']
  })

  return docs
}

// Delete all files and directories
export async function deleteAll () {
  const docs = await rootDirContents()

  await Promise.all(docs.map(doc => cozy.files.trashById(doc._id)))

  return cozy.files.clearTrash()
}

// Creates a root directory named 'couchdb-folder', used in a lot of v2 tests.
//
// TODO: Use test data builders instead
export async function createTheCouchdbFolder () {
  await builders.dir()
    .named('couchdb-folder')
    .inRootDir()
    .build()
}
