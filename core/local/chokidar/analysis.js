/** Turn messy low-level events into normalized high-level ones.
 *
 * ## Input
 *
 * The analysis receives
 * {@link module:core/local/chokidar/local_event|LocalEvent} batches.
 *
 * Moves are typically detected as `unlink*` + `add*` events. Directory moves
 * end up as a whole tree of those.
 *
 * Events are not necessarily in the correct order. Nor are they necessarily
 * batched together.
 *
 * ## Analysis substeps
 *
 * 1. {@link module:core/local/chokidar/analyse_doc_events|analyseDocEvents}
 * 2. {@link module:core/local/chokidar/squash_moves|squashMoves}
 * 4. {@link module:core/local/chokidar/final_sort|finalSort}
 * 5. {@link module:core/local/chokidar/analysis~separatePendingChanges|separatePendingChanges}
 *
 * ## Known issues
 *
 * - Substeps may end up eating a lot of CPU & RAM when batches are too big.
 * - See also individual substep issues.
 *
 * @module core/local/chokidar/analysis
 * @flow
 */

const { analyseDocEvents } = require('./analyse_doc_events')
const { finalSort } = require('./final_sort')
const { squashMoves } = require('./squash_moves')
const logger = require('../../utils/logger')

/*::
import type { LocalEvent } from './local_event'
import type { LocalChange } from './local_change'
*/

const log = logger({
  component: 'LocalAnalysis'
})

module.exports = function analysis(
  events /*: LocalEvent[] */,
  pendingChanges /*: LocalChange[] */
) /*: LocalChange[] */ {
  const changes /*: LocalChange[] */ = analyseDocEvents(events, pendingChanges)
  squashMoves(changes)
  finalSort(changes)
  return separatePendingChanges(changes, pendingChanges)
}

/** Push back pending changes.
 *
 * More low-level events are expected to come up for those changes to be
 * complete. They will be injected back in the next analysis run.
 *
 * This step helped us fix a bunch of move scenarios with unexpected event
 * batches.
 *
 * ## Known issues
 *
 * - May break events order.
 * - No timeout (some changes may be pending forever).
 */
function separatePendingChanges(
  changes /*: LocalChange[] */,
  pendingChanges /*: LocalChange[] */
) /*: LocalChange[] */ {
  log.trace('Reserve changes in progress for next flush...')

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (change.wip) {
      if (change.type === 'DirMove' || change.type === 'FileMove') {
        log.debug(
          {
            change: change.type,
            oldpath: change.old.path,
            path: change.path,
            ino: change.ino
          },
          'incomplete change'
        )
      } else {
        log.debug(
          { change: change.type, path: change.path },
          'incomplete change'
        )
      }
      pendingChanges.push(changes[i])
    } else {
      log.debug(`Identified ${changes.length} change(s).`)
      log.debug(`${pendingChanges.length} of them are still pending.`)
      return changes.slice(i)
    }
  }
  // All actions are WIP
  return []
}
