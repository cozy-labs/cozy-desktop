/* @flow */

const AtomWatcher = require('./atom_watcher')
const ChokidarWatcher = require('./chokidar_watcher')
const logger = require('../logger')

/*::
import type Pouch from '../pouch'
import type Prep from '../prep'
import type EventEmitter from 'events'
import type { ChokidarEvent } from './chokidar_event'
import type { Checksumer } from './checksumer'

export interface Watcher {
  checksumer: Checksumer,
  running: Promise<*>,
  start (): Promise<*>,
  stop (force: ?bool): Promise<*>,
}
*/

const log = logger({
  component: 'LocalWatcher'
})

function build (syncPath /*: string */, prep /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */) /*: Watcher */ {
  const env = process.env.COZY_FS_WATCHER
  if (env === 'experimental' || env === 'atom') {
    if (process.platform === 'linux') {
      return new AtomWatcher(syncPath, prep, pouch, events)
    }
    log.warn('The experimental watcher is only available on Linux')
  }
  return new ChokidarWatcher(syncPath, prep, pouch, events)
}

module.exports = { build }
