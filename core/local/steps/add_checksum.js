/* @flow */

const path = require('path')

const logger = require('../../logger')
const log = logger({
  component: 'addChecksum'
})

/*::
import type Buffer from './buffer'
import type { Checksumer } from '../checksumer'
*/

// This step adds md5sum for files:
// - for created and updated events, it is mandatory
// - for scan events, it is always done but an optimization could be to do it
//   only for new files and files those mtime or path has changed
// - for renamed events, it is done in case a file was created while the client
//   was stopped and is renamed while the client is starting (the renamed event
//   that will be transformed in a created event in dispatch), but we could be
//   smarter
// TODO the 2 optimizations ↑
module.exports = function (buffer /*: Buffer */, opts /*: { syncPath: string , checksumer: Checksumer } */) /*: Buffer */ {
  return buffer.asyncMap(async (events) => {
    for (const event of events) {
      try {
        if (['created', 'modified', 'scan', 'renamed'].includes(event.action) &&
            event.kind === 'file') {
          log.debug({path: event.path, action: event.action}, 'checksum')
          const absPath = path.join(opts.syncPath, event.path)
          event.md5sum = await opts.checksumer.push(absPath)
        }
      } catch (err) {
        // Even if the file is no longer at the expected path, we want to
        // keep the event. Maybe it was one if its parents directory that was
        // moved, and then we can refine the event later (in incompleteFixer).
        event.incomplete = true
        log.info({err, event}, 'Cannot compute checksum')
      }
    }
    return events
  })
}
