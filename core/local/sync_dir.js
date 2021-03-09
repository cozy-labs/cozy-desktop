/** Sync directory helpers
 *
 * @module core/local/sync_dir
 * @flow
 */

const fs = require('fs')

const { SYNC_DIR_UNLINKED_MESSAGE } = require('./errors')

/*::
import type EventEmitter from 'events'
*/

module.exports = {
  ensureExistsSync,
  startIntervalCheck
}

/** Make sure syncPath actually exists.
 *
 * In case it doesn't, emit 'syncdir-unlinked' and throws.
 * Any other error occuring during the check will be thrown too.
 */
function ensureExistsSync(
  { syncPath, events } /*: {syncPath: string, events: EventEmitter} */
) /*: void */ {
  if (!fs.existsSync(syncPath)) {
    events.emit('syncdir-unlinked')
    throw new Error(SYNC_DIR_UNLINKED_MESSAGE)
  }
}

/** Start regularly checking that syncPath actually exists.
 *
 * Caller should stop the regular check at some point with clearInterval().
 */
function startIntervalCheck(
  context /*: {syncPath: string, events: EventEmitter} */
) /*: IntervalID */ {
  return setInterval(() => ensureExistsSync(context), 5000)
}
