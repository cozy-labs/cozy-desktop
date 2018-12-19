/* @flow */

const path = require('path')

const { id } = require('../../metadata')
const stater = require('../stater')
const logger = require('../../logger')
const log = logger({
  component: 'addInfos'
})

/*::
import type Buffer from './buffer'
import type { Checksumer } from '../checksumer'
*/

// This step adds some basic informations about events: _id, docType and stats.
module.exports = function (buffer /*: Buffer */, opts /*: { syncPath: string } */) /*: Buffer */ {
  return buffer.asyncMap(async (events) => {
    const batch = []
    for (const event of events) {
      try {
        if (event.action !== 'initial-scan-done') {
          // TODO if (event.kind === 'symlink') emit an error
          event._id = id(event.path)
          if (['created', 'modified', 'renamed'].includes(event.action)) {
            log.debug({path: event.path, action: event.action}, 'stat')
            event.stats = await stater.stat(path.join(opts.syncPath, event.path))
          }
          if (event.stats) { // created, modified, renamed, scan
            event.docType = stater.kind(event.stats)
          } else { // deleted
            // If kind is unknown, we say it's a file arbitrary
            event.docType = event.kind === 'directory' ? 'directory' : 'file'
          }
        }
        batch.push(event)
      } catch (err) {
        log.info({err, event}, 'Cannot get infos')
        console.log('stats', err) // TODO error handling
      }
    }
    return batch
  })
}
