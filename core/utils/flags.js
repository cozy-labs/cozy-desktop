/**
 * @module core/utils/flags
 * @flow
 */

const { RemoteCozy } = require('../remote/cozy')

/*::
import type { Config } from '../config'
*/

const flags = async (config /*: Config */) => {
  const remoteCozy = new RemoteCozy(config)
  const remoteFlags = await remoteCozy.flags()
  const localFlags = config.flags

  return {
    ...remoteFlags,
    ...localFlags
  }
}

module.exports = flags
