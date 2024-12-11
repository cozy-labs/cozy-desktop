/**
 * @module core/utils/capabilities
 * @flow
 */

const { logger } = require('./logger')
const { RemoteCozy } = require('../remote/cozy')
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
    log.error('could not fetch remote capabilities; returning local cache', {
      err
    })
  }
  return store
}

module.exports = capabilities
