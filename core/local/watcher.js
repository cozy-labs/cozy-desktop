/* @flow */

const AtomWatcher = require('./atom_watcher')
const ChokidarWatcher = require('./chokidar_watcher')

/*::
import type { WatcherType } from '../config'
import type { AtomEventsDispatcher } from './steps/dispatch'
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

export type LocalWatcherOptions = {
  +config: {
    +syncPath: string,
    +watcherType: WatcherType
  },
  events: EventEmitter,
  ignore: Ignore,
  onAtomEvents?: AtomEventsDispatcher,
  pouch: Pouch,
  prep: Prep
}
*/

function build ({config, prep, pouch, events, ignore, onAtomEvents} /*: LocalWatcherOptions */) /*: Watcher */ {
  const { syncPath, watcherType } = config

  if (watcherType === 'atom') {
    return new AtomWatcher({syncPath, prep, pouch, events, ignore, onAtomEvents})
  } else {
    return new ChokidarWatcher(syncPath, prep, pouch, events)
  }
}

module.exports = { build }
