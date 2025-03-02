/* @flow */
/* eslint-env mocha */

require('../../../core/globals')

// Setup network so that all test requests will go through `electron-fetch`
const { app, session } = require('electron')

/*::
import type { Config } from '../../../core/config'
*/

let originalNet
const setupNetwork = async () => {
  await app.whenReady()
  originalNet = await network.setup(
    app,
    { 'resolve-ipv4-first': true },
    session,
    ''
  )
}
const resetNetwork = async () => {
  if (originalNet && (await originalNet)) {
    await network.reset(app, session, originalNet)
    originalNet = null
  }
}
setupNetwork()

const CozyClient = require('cozy-client').default
const OldCozyClient = require('cozy-client-js').Client

const {
  FILES_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID
} = require('../../../core/remote/constants')
const network = require('../../../gui/js/network')

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
  version: 3,
  cozyURL: COZY_URL,
  token: process.env.COZY_STACK_TOKEN
})

const oauthCozy = async (config /*: Config */) /*: OldCozyClient */ => {
  const client = new OldCozyClient({
    cozyURL: config.cozyUrl,
    oauth: {
      clientParams: config.client,
      storage: config
    }
  })
  await client.authorize()

  return client
}

// Build a new cozy-client instance from an old cozy-client-js instance
const newClient = async (
  oldClient /*: OldCozyClient */ = cozy
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
  oauthCozy,
  newClient,
  deleteAll,
  setupNetwork,
  resetNetwork
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
    if (
      err.status !== 404 && // Document does not exist anymore
      err.status !== 400 // Document is already in the trash
    ) {
      throw err
    }
  }

  return cozy.files.clearTrash()
}
