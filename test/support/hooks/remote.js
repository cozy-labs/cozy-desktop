/* eslint-env mocha */
/* @flow */

/** Cleanup the remote instance once and for all.
 *
 * When creating an instance, `cozy-stack` automatically creates two folders:
 * `/Administrative/` and `/Photos/`. We want to delete these as their presence
 * can lead to content mismatch in certain circumstances.
 */

const configHelpers = require('../helpers/config')
const { RemoteTestHelpers } = require('../helpers/remote')

before(configHelpers.createConfig)
before(configHelpers.registerClient)
before(async function() {
  const helpers = new RemoteTestHelpers(this)
  await helpers.clean()
})
