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
 * 4. {@link module:core/local/chokidar/analysis~finalSort|finalSort}
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
const localChange = require('./local_change')
const { squashMoves } = require('./squash_moves')
const logger = require('../../utils/logger')
const measureTime = require('../../utils/perfs')

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

const finalSorter = (a /*: LocalChange */, b /*: LocalChange */) => {
  if (a.wip && !b.wip) return -1
  if (b.wip && !a.wip) return 1

  // b is deleting something which is a children of what a adds
  if (
    !localChange.addPath(b) &&
    localChange.childOf(localChange.addPath(a), localChange.delPath(b))
  )
    return 1
  // a is deleting something which is a children of what b adds
  if (
    !localChange.addPath(a) &&
    localChange.childOf(localChange.addPath(b), localChange.delPath(a))
  )
    return -1

  // b is moving something which is a children of what a adds
  if (localChange.childOf(localChange.addPath(a), localChange.delPath(b)))
    return -1
  // a is deleting or moving something which is a children of what b adds
  if (localChange.childOf(localChange.addPath(b), localChange.delPath(a)))
    return 1

  // if one change is a child of another, it takes priority
  if (localChange.isChildAdd(a, b)) return -1
  if (localChange.isChildUpdate(a, b)) return -1
  if (localChange.isChildDelete(b, a)) return -1
  if (localChange.isChildAdd(b, a)) return 1
  if (localChange.isChildUpdate(b, a)) return 1
  if (localChange.isChildDelete(a, b)) return 1

  // a is deleted what b added
  if (localChange.delPath(a) === localChange.addPath(b)) return -1
  // b is deleting what a added
  if (localChange.delPath(b) === localChange.addPath(a)) return 1

  // both adds at same path (seen with move + add)
  if (
    localChange.addPath(a) &&
    localChange.addPath(a) === localChange.addPath(b)
  )
    return -1
  // both deletes at same path (seen with delete + move)
  if (
    localChange.delPath(a) &&
    localChange.delPath(a) === localChange.delPath(b)
  )
    return 1

  // otherwise, order by add path
  if (localChange.lower(localChange.addPath(a), localChange.addPath(b)))
    return -1
  if (localChange.lower(localChange.addPath(b), localChange.addPath(a)))
    return 1

  // if there isnt 2 add paths, sort by del path
  if (localChange.lower(localChange.delPath(b), localChange.delPath(a)))
    return -1

  return 1
}

/** Final sort to ensure multiple changes at the same paths can be merged.
 *
 * Known issues:
 *
 * - Hard to change without breaking things.
 */
function finalSort(changes /*: LocalChange[] */) {
  log.trace('Final sort...')
  const stopMeasure = measureTime('LocalWatcher#finalSort')
  changes.sort(finalSorter)
  stopMeasure()
}
