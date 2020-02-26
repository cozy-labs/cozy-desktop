/** This step adds some basic informations about events:
 *
 * - _id
 * - docType
 * - stats
 *
 * @module core/local/atom/add_infos
 * @flow
 */

const _ = require('lodash')
const path = require('path')

const { id, kind } = require('../../metadata')
const logger = require('../../utils/logger')
const stater = require('../stater')

const STEP_NAME = 'addInfos'

const log = logger({
  component: `atom/${STEP_NAME}`
})

/*::
import type { Pouch } from '../../pouch'
import type { Metadata } from '../../metadata'
import type Channel from './channel'
import type { AtomEvent } from './event'
*/

module.exports = {
  STEP_NAME,
  loop
}

/** Add _id & stats to event batches pulled from the given channel.
 *
 * Arbitrarily assume event kind is file by default.
 *
 * Return a new Channel where new events with stats will be pushed.
 */
function loop(
  channel /*: Channel */,
  opts /*: { syncPath: string, pouch: Pouch } */
) /*: Channel */ {
  return channel.asyncMap(async events => {
    const batch = []
    for (const event of events) {
      if (event.kind === 'symlink') {
        log.error({ event }, 'Symlinks are not supported')
        // TODO display an error in the UI
        continue
      }
      try {
        if (event.action !== 'initial-scan-done') {
          event._id = id(event.path)
          if (needsStats(event)) {
            log.debug({ path: event.path, action: event.action }, 'stat')
            event.stats = await stater.stat(
              path.join(opts.syncPath, event.path)
            )
          }
          if (event.stats) {
            // created, modified, renamed, scan
            event.kind = stater.kind(event.stats)
          } else {
            // deleted
            // If kind is unknown, we say it's a file arbitrary
            if (event.kind !== 'directory' && event.kind !== 'file') {
              _.set(event, [STEP_NAME, 'kindConvertedFrom'], event.kind)

              const doc =
                event._id && (await opts.pouch.byIdMaybeAsync(event._id))
              event.kind = doc ? kind(doc) : 'file'
            }
          }
        }
      } catch (err) {
        log.debug({ err, event }, 'Cannot get infos')
        _.set(event, ['incomplete', STEP_NAME], err.message)
      }
      batch.push(event)
    }
    return batch
  })
}

function needsStats(event /*: AtomEvent */) /*: boolean %checks */ {
  return (
    ['created', 'modified', 'renamed', 'scan'].includes(event.action) &&
    !event.stats
  )
}
