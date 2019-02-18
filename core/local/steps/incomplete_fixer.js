/* @flow */

const path = require('path')

const { id } = require('../../metadata')
const stater = require('../stater')

// Drop incomplete events after this delay (in milliseconds).
// TODO tweak the value (the initial value was chosen because it looks like a
//      good value, it is not something that was computed)
const DELAY = 3000

// TODO add unit tests and logs

/*::
import type Buffer from './buffer'
import type { AtomWatcherEvent } from './event'
import type { Checksumer } from '../checksumer'

type IncompleteItem = {
  event: AtomWatcherEvent,
  timestamp: number,
}
*/

module.exports = {
  step
}

async function rebuildIncompleteEvent (item /*: IncompleteItem */, event /*: AtomWatcherEvent */, opts /*: { syncPath: string , checksumer: Checksumer } */) /*: Promise<AtomWatcherEvent> */ {
  // The || '' is just a trick to please flow
  const oldPath /*: string */ = event.oldPath || ''
  const p = item.event.path.replace(oldPath, event.path)
  const absPath = path.join(opts.syncPath, p)
  const stats = await stater.stat(absPath)
  const kind = stater.kind(stats)
  let md5sum
  if (kind === 'file') {
    md5sum = await opts.checksumer.push(absPath)
  }
  return {
    action: item.event.action,
    path: p,
    _id: id(p),
    kind,
    stats,
    md5sum
  }
}

// When a file is added or updated, and it is moved just after, the first event
// is marked as incomplete by addChecksum because we cannot compute the
// checksum at the given path. But the event is still relevant, in particular if
// a directory that is an ancestor of this file has been moved. With the renamed
// event, by comparing the path, we can extrapolate the new path and check with
// fs.stats if we have a file here.
//
// Cf test/property/local_watcher/swedish_krona.json
function step (buffer /*: Buffer */, opts /*: { syncPath: string , checksumer: Checksumer } */) /*: Buffer */ {
  const incompletes = []
  return buffer.asyncMap(async (events) => {
    // Filter out the incomplete events
    const batch = []
    for (const event of events) {
      if (event.incomplete) {
        incompletes.push({ event, timestamp: Date.now() })
        continue
      }
      batch.push(event)
    }

    // Let's see if we can match an incomplete event with this renamed event
    for (const event of batch) {
      if (incompletes.length === 0 || event.action !== 'renamed') {
        continue
      }

      const now = Date.now()
      for (let i = 0; i < incompletes.length; i++) {
        const item = incompletes[i]

        // Remove the expired incomplete events
        if (item.timestamp + DELAY < now) {
          incompletes.splice(i, 1)
          i--
          continue
        }

        if (event.oldPath && item.event.path.startsWith(event.oldPath + path.sep)) {
          // We have a match, try to rebuild the incomplete event
          try {
            const rebuilt = await rebuildIncompleteEvent(item, event, opts)
            batch.push(rebuilt)
          } catch (err) {
            // If we have an error, there is probably not much that we can do
          }
          incompletes.splice(i, 1)
          break
        }
      }
    }

    return batch
  })
}
