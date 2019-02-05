/* @flow */

const AtomWatcher = require('./atom_watcher')
const ChokidarWatcher = require('./chokidar_watcher')

/*::
import type Pouch from '../pouch'
import type Prep from '../prep'
import type EventEmitter from 'events'
import type { Ignore } from '../ignore'
import type { ChokidarEvent } from './chokidar_event'
import type { Checksumer } from './checksumer'

type WatcherType = 'atom' | 'chokidar'

export interface Watcher {
  checksumer: Checksumer,
  running: Promise<*>,
  start (): Promise<*>,
  stop (force: ?bool): Promise<*>,
}
*/

function build (config /*: { syncPath: string, watcherType: string } */, prep /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */, ignore /*: Ignore */) /*: Watcher */ {
  const { syncPath, watcherType } = config

  if (watcherType === 'atom') {
    return new AtomWatcher(syncPath, prep, pouch, events, ignore)
  } else {
    return new ChokidarWatcher(syncPath, prep, pouch, events)
  }
}

module.exports = { build }
