/** This step fires a `local-start` event for every batch of FS events so we
 * keep the app's activity status up-to-date.
 *
 * `local-end` events will be fired by the dispatch step.
 *
 * @module core/local/channel_watcher/fire_local_start_event
 * @flow
 */

// eslint-disable-next-line no-unused-vars
const STEP_NAME = 'fireLocatStartEvent'

/*::
import type Channel from './channel'
import type EventEmitter from 'events'
*/

module.exports = {
  loop
}

/** Fire a local-start event for every batch of events
 *
 * Return a new Channel where all events will be pushed after we've emitted a
 * `local-start` event for each of them.
 */
function loop(
  channel /*: Channel */,
  opts /*: { events: EventEmitter } */
) /*: Channel */ {
  return channel.map(events => {
    opts.events.emit('local-start')
    return events
  })
}
