/**
 * @module core/local/chokidar/separate_pending_changes
 * @flow
 */

const logger = require('../../utils/logger')

/*::
import type { LocalChange } from './local_change'
*/

const component = 'chokidar/separate_pending_changes'
const log = logger({ component })

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
const separatePendingChanges = (
  changes /*: LocalChange[] */,
  pendingChanges /*: LocalChange[] */
) /*: LocalChange[] */ => {
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

module.exports = {
  separatePendingChanges
}
