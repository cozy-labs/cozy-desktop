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

function userDefinedWatcherType (env) /*: WatcherType | null */ {
  const { COZY_FS_WATCHER } = env
  if (COZY_FS_WATCHER === 'atom') {
    return 'atom'
  } else if (COZY_FS_WATCHER === 'chokidar') {
    return 'chokidar'
  }
  return null
}

function platformDefaultWatcherType (platform /*: string */) /*: WatcherType */ {
  if (platform === 'darwin') {
    return 'chokidar'
  }
  return 'chokidar' // TODO: Use atom watcher
}

function build (syncPath /*: string */, prep /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */, ignore /*: Ignore */) /*: Watcher */ {
  const watcherType = (
    userDefinedWatcherType(process.env) ||
    platformDefaultWatcherType(process.platform)
  )
  if (watcherType === 'atom') {
    return new AtomWatcher(syncPath, prep, pouch, events, ignore)
  } else {
    return new ChokidarWatcher(syncPath, prep, pouch, events)
  }
}

module.exports = { build }
