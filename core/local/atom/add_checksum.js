/* @flow */

const _ = require('lodash')
const path = require('path')

const logger = require('../../logger')

const STEP_NAME = 'addChecksum'

const log = logger({
  component: `atom/${STEP_NAME}`
})
const contentActions = new Set(['created', 'modified', 'renamed', 'scan'])

/*::
import type Channel from './channel'
import type { Checksumer } from '../checksumer'
import type { AtomEvent } from './event'
*/

module.exports = {
  loop
}

// This step adds md5sum for files:
// - for created and updated events, it is mandatory
// - for scan events, it is always done but an optimization could be to do it
//   only for new files and files whose mtime or path has changed
// - for renamed events, it is done in case a file was created while the client
//   was stopped and is renamed while the client is starting (the renamed event
//   that will be transformed in a created event in dispatch), but we could be
//   smarter
// TODO the 2 optimizations ↑
function loop(
  channel /*: Channel */,
  opts /*: { syncPath: string , checksumer: Checksumer } */
) /*: Channel */ {
  return channel.asyncMap(async events => {
    for (const event of events) {
      try {
        if (event.incomplete) {
          continue
        }
        if (isFileWithContent(event) && !event.md5sum) {
          log.debug(
            { path: event.path, action: event.action },
            'computing checksum'
          )
          const absPath = path.join(opts.syncPath, event.path)
          event.md5sum = await opts.checksumer.push(absPath)
        }
      } catch (err) {
        // Even if the file is no longer at the expected path, we want to
        // keep the event. Maybe it was one if its parents directory that was
        // moved, and then we can refine the event later (in incompleteFixer).
        _.set(event, ['incomplete', STEP_NAME], err.message)
        log.debug({ err, event }, 'Cannot compute checksum')
      }
    }
    return events
  })
}

function isFileWithContent(event /*: AtomEvent */) /*: boolean %checks */ {
  return event.kind === 'file' && contentActions.has(event.action)
}
