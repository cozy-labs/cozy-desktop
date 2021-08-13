/* @flow */
/* eslint-env mocha */

require('../../../core/globals')

// Setup proxy so that all test requests will go through `electron-fetch`
const { app, session } = require('electron')
const proxy = require('../../../gui/js/proxy')

let originalNet
const setupGlobalProxy = async () => {
  await app.whenReady()
  originalNet = await proxy.setup(app, {}, session, '')
}
const resetGlobalProxy = async () => {
  if (originalNet && (await originalNet)) {
    await proxy.reset(app, session, originalNet)
    originalNet = null
  }
}
setupGlobalProxy()

const OldCozyClient = require('cozy-client-js').Client
const CozyClient = require('cozy-client').default

const {
  FILES_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID
} = require('../../../core/remote/constants')

// The URL of the Cozy instance used for tests
const COZY_URL = process.env.COZY_URL || 'http://cozy.localhost:8080'

if (!process.env.COZY_STACK_TOKEN) {
  const domain = COZY_URL.replace('http://', '')
  // eslint-disable-next-line no-console
  console.log(
    'COZY_STACK_TOKEN is missing. You can generate it with this command:'
  )
  // eslint-disable-next-line no-console
  console.log(
    `export COZY_CLIENT_ID=$(cozy-stack instances client-oauth "${domain}" http://localhost/ test github.com/cozy-labs/cozy-desktop)`
  )
  // eslint-disable-next-line no-console
  console.log(
    `export COZY_STACK_TOKEN=$(cozy-stack instances token-oauth "${domain}" "$COZY_CLIENT_ID" io.cozy.files)`
  )
  // eslint-disable-next-line no-console
  console.log(' ')
  throw new Error('No COZY_STACK_TOKEN')
}

// A cozy-client-js instance
const cozy = new OldCozyClient({
  cozyURL: COZY_URL,
  token: process.env.COZY_STACK_TOKEN
})

// Build a new cozy-client instance from an old cozy-client-js instance
const newClient = async (
  oldClient /*: OldCozyClient */
) /*: Promise<CozyClient>  */ => {
  if (oldClient._oauth) {
    return await CozyClient.fromOldOAuthClient(oldClient)
  } else {
    return await CozyClient.fromOldClient(oldClient)
  }
}

module.exports = {
  COZY_URL,
  cozy,
  newClient,
  deleteAll,
  setupGlobalProxy,
  resetGlobalProxy
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

  try {
    await Promise.all(remoteDocs.map(doc => cozy.files.trashById(doc._id)))
  } catch (err) {
    if (err.status !== 404) throw err
  }

  return cozy.files.clearTrash()
}
