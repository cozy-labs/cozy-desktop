/** The component that watches the local synchronized folder.
 *
 * There are currently 2 implementations:
 *
 * - {@link module:core/local/channel_watcher/watcher|channel}
 * - {@link module:core/local/chokidar/watcher|chokidar}
 *
 * @module core/local/watcher
 * @see module:core/config~watcherType
 * @flow
 */

const { ChannelWatcher } = require('./channel_watcher')
const ChokidarWatcher = require('./chokidar/watcher')

/*::
import type { Config } from '../config'
import type { ChannelEventsDispatcher } from './channel_watcher/dispatch'
import type { Pouch } from '../pouch'
import type Prep from '../prep'
import type EventEmitter from 'events'
import type { Ignore } from '../ignore'
import type { ChokidarEvent } from './chokidar/event'
import type { Checksumer } from './checksumer'

export interface Watcher {
  checksumer: Checksumer,
  running: Promise<*>,
  start (): Promise<*>,
  stop (force: ?bool): Promise<*>,
}

export type LocalWatcherOptions = {
  config: Config,
  events: EventEmitter,
  ignore: Ignore,
  onChannelEvents?: ChannelEventsDispatcher,
  pouch: Pouch,
  prep: Prep
}
*/

function build(
  {
    config,
    prep,
    pouch,
    events,
    ignore,
    onChannelEvents
  } /*: LocalWatcherOptions */
) /*: Watcher */ {
  const { syncPath, watcherType } = config

  if (watcherType === 'channel') {
    return new ChannelWatcher({
      config,
      prep,
      pouch,
      events,
      ignore,
      onChannelEvents
    })
  } else {
    return new ChokidarWatcher(syncPath, prep, pouch, events)
  }
}

module.exports = { build }
