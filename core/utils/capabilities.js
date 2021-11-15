/**
 * @module core/utils/capabilities
 * @flow
 */

const { RemoteCozy } = require('../remote/cozy')
const logger = require('./logger')
/*::
import type { Config } from '../config'
*/

const log = logger({
  component: 'capabilities'
})

const store = {}

const capabilities = async (config /*: Config */) => {
  try {
    if (Object.keys(store).length === 0) {
      const remoteCozy = new RemoteCozy(config)
      const remoteCapabilities = await remoteCozy.capabilities()
      Object.assign(store, remoteCapabilities)
    }
  } catch (err) {
    log.error(
      { err },
      'could not fetch remote capabilities; returning local cache'
    )
  }
  return store
}

module.exports = capabilities
