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

export interface Watcher {
  checksumer: Checksumer,
  running: Promise<*>,
  start (): Promise<*>,
  stop (force: ?bool): Promise<*>,
}
*/

function build (syncPath /*: string */, prep /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */, ignore /*: Ignore */) /*: Watcher */ {
  let watcher = 'atom'
  if (process.platform === 'darwin') {
    watcher = 'chokidar'
  }
  const env = process.env.COZY_FS_WATCHER
  if (['experimental', 'atom'].includes(env)) {
    watcher = 'atom'
  } else if (env === 'chokidar') {
    watcher = 'chokidar'
  }
  // FIXME Integration and scenario tests use ChokidarEvents
  // and are not yet compatible with atom/watcher
  if (process.env) {
    watcher = 'chokidar'
  }
  if (watcher === 'atom') {
    return new AtomWatcher(syncPath, prep, pouch, events, ignore)
  } else {
    return new ChokidarWatcher(syncPath, prep, pouch, events)
  }
}

module.exports = { build }
