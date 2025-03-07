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

const client = new CozyClient({
  uri: COZY_URL,
  token: process.env.COZY_STACK_TOKEN,
  throwFetchErrors: true
})

module.exports = {
  COZY_URL,
  client,
  setupNetwork,
  resetNetwork
}
