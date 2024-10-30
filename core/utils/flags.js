/**
 * @module core/utils/flags
 * @flow
 */

const { RemoteCozy } = require('../remote/cozy')

/*::
import type { Config } from '../config'
*/

const DEBUG_FLAG = 'desktop.debug.enabled'
const MEASURE_PERF_FLAG = 'desktop.measure-perf.enabled'
const SHOW_SYNCED_FOLDERS_FLAG =
  'settings.partial-desktop-sync.show-synced-folders-selection'

const all = async (config /*: Config */) => {
  const remoteCozy = new RemoteCozy(config)
  const remoteFlags = await remoteCozy.flags()
  const localFlags = config.flags

  return {
    ...remoteFlags,
    ...localFlags
  }
}

module.exports = {
  DEBUG_FLAG,
  MEASURE_PERF_FLAG,
  SHOW_SYNCED_FOLDERS_FLAG,
  all
}
