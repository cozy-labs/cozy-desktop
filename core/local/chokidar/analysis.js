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
 * 5. {@link module:core/local/chokidar/separate_pending_changes|separatePendingChanges}
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
const { separatePendingChanges } = require('./separate_pending_changes')
const { squashMoves } = require('./squash_moves')

/*::
import type { LocalEvent } from './local_event'
import type { LocalChange } from './local_change'
*/

module.exports = function analysis(
  events /*: LocalEvent[] */,
  pendingChanges /*: LocalChange[] */
) /*: LocalChange[] */ {
  const changes /*: LocalChange[] */ = analyseDocEvents(events, pendingChanges)
  squashMoves(changes)
  finalSort(changes)
  return separatePendingChanges(changes, pendingChanges)
}
