/* @flow */

const ChokidarWatcher = require('./chokidar_watcher')

/*::
import type Pouch from '../pouch'
import type Prep from '../prep'
import type EventEmitter from 'events'
import type { ChokidarEvent } from './chokidar_event'
import type { Checksumer } from './checksumer'

export type Watcher = {
  checksumer: Checksumer,
  running: Promise<*>,
  start: () => Promise<*>,
  stop: (force: ?bool) => Promise<*>,
  ensureDirSync: () => void,
  onFlush: (ChokidarEvent[]) => *
}
*/

function build (syncPath /*: string */, prep /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */) /*: Watcher */ {
  return new ChokidarWatcher(syncPath, prep, pouch, events)
}

module.exports = { build }
