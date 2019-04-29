/* @flow */

const _ = require('lodash')
const path = require('path')

const { id } = require('../../metadata')
const stater = require('../stater')
const logger = require('../../logger')

const STEP_NAME = 'addInfos'

const log = logger({
  component: `atom/${STEP_NAME}`
})

/*::
import type Buffer from './buffer'
*/

module.exports = {
  loop
}

// This step adds some basic informations about events: _id, docType and stats.
function loop(
  buffer /*: Buffer */,
  opts /*: { syncPath: string } */
) /*: Buffer */ {
  return buffer.asyncMap(async events => {
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
          if (['created', 'modified', 'renamed'].includes(event.action)) {
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
              event.kind = 'file'
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
