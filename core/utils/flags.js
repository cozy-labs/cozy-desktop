/**
 * @module core/utils/flags
 * @flow
 */

const { RemoteCozy } = require('../remote/cozy')

/*::
import type { Config } from '../config'
*/

const MEASURE_PERF_FLAG = 'desktop.measure-perf'
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
  MEASURE_PERF_FLAG,
  SHOW_SYNCED_FOLDERS_FLAG,
  all
}
