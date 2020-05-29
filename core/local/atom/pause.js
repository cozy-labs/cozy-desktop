/** This step bufferizes events while the watcher is paused.
 *
 * @module core/local/atom/pause
 * @flow
 */

const STEP_NAME = 'pause'

/*::
import type Channel from './channel'
import type EventEmitter from 'events'

type WaitState = {
  paused: boolean
}
*/

module.exports = {
  STEP_NAME,
  loop,
  initialState
}

function initialState() {
  return { [STEP_NAME]: { paused: false } }
}

/** Bufferize event batches while the watcher is paused
 *
 * The watcher will be paused until the current synchronization cycle is done so
 * that those events will have the latest stats and checksum values.
 * This should avoid detecting erronous changes when the synchronization does
 * multiple operations on the same documents.
 *
 * Return a new Channel where all buffered events will be pushed.
 */
function loop(
  channel /*: Channel */,
  opts /*: { events: EventEmitter, state: WaitState } */
) /*: Channel */ {
  opts.events.on('pause', () => {
    opts.state.paused = true
  })
  opts.events.on('resume', () => {
    opts.state.paused = false
  })

  return channel.asyncMap(async batch => {
    await watcherResumed(opts)

    return batch
  })
}

async function watcherResumed(
  opts /*: { events: EventEmitter, state: WaitState } */
) {
  return new Promise(resolve => {
    if (!opts.state.paused) {
      resolve(true)
    } else {
      opts.events.once('resume', () => {
        resolve(true)
      })
    }
  })
}
