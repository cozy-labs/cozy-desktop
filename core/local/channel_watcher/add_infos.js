/** This step adds some basic informations about events:
 *
 * - _id
 * - docType
 * - stats
 *
 * @module core/local/channel_watcher/add_infos
 * @flow
 */

const _ = require('lodash')
const path = require('path')

const { kind } = require('../../metadata')
const logger = require('../../utils/logger')
const stater = require('../stater')

const STEP_NAME = 'addInfos'

const log = logger({
  component: `ChannelWatcher/${STEP_NAME}`
})

/*::
import type { Config } from '../../config'
import type { Pouch } from '../../pouch'
import type { Metadata } from '../../metadata'
import type Channel from './channel'
import type { ChannelEvent } from './event'
*/

module.exports = {
  STEP_NAME,
  loop
}

/** Add stats to event batches pulled from the given channel.
 *
 * Arbitrarily assume event kind is file by default.
 *
 * Return a new Channel where new events with stats will be pushed.
 */
function loop(
  channel /*: Channel */,
  opts /*: { config: Config, pouch: Pouch } */
) /*: Channel */ {
  const syncPath = opts.config.syncPath

  return channel.asyncMap(async events => {
    const batch = []
    for (const event of events) {
      if (event.kind === 'symlink') {
        log.warn({ event }, 'Symlinks are not supported')
        // TODO display an error in the UI
        continue
      }
      if (event.kind === 'magic') {
        // Event signaling end of test scenario's simulation
        batch.push(event)
        continue
      }
      try {
        if (event.action !== 'initial-scan-done') {
          if (needsStats(event)) {
            log.debug({ path: event.path, action: event.action }, 'stat')
            event.stats = await stater.stat(path.join(syncPath, event.path))
          }

          if (event.stats) {
            // created, modified, renamed, scan
            event.kind = stater.kind(event.stats)
          } else if (needsPouchRecord(event)) {
            // Even if the doc is deleted, we probably have a better chance to
            // get the right kind by using its own.
            const doc /*: ?Metadata */ = await opts.pouch.byLocalPath(
              event.path
            )

            // If kind is unknown, we say it's a file arbitrary
            if (event.kind !== 'directory' && event.kind !== 'file') {
              _.set(event, [STEP_NAME, 'kindConvertedFrom'], event.kind)

              event.kind = doc ? kind(doc) : 'file'
            }
            // We save the deleted inode for use in other steps
            if (event.action === 'deleted' && doc) {
              event.deletedIno = doc.local.fileid || doc.local.ino
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

function needsStats(event /*: ChannelEvent */) /*: boolean %checks */ {
  return (
    ['created', 'modified', 'renamed', 'scan'].includes(event.action) &&
    !event.stats
  )
}

function needsPouchRecord(event /*: ChannelEvent */) /*: boolean %checks */ {
  return (
    event.action === 'deleted' ||
    (event.kind !== 'directory' && event.kind !== 'file')
  )
}
