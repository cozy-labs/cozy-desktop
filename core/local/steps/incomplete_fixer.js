/* @flow */

const path = require('path')

const stater = require('../stater')
const metadata = require('../../metadata')
const logger = require('../../logger')
const log = logger({
  component: 'atom/incompleteFixer'
})

// Drop incomplete events after this delay (in milliseconds).
// TODO tweak the value (the initial value was chosen because it looks like a
//      good value, it is not something that was computed)
const DELAY = 3000

// TODO add unit tests and logs

/*::
import type Buffer from './buffer'
import type { AtomWatcherEvent, Batch } from './event'
import type { Checksumer } from '../checksumer'

type IncompleteItem = {
  event: AtomWatcherEvent,
  timestamp: number,
}

type IncompleteFixerOptions = {
  syncPath: string,
  checksumer: Checksumer
}
*/

module.exports = {
  loop,
  step
}

function wasRenamedSuccessively (previousIncomplete /*: IncompleteItem */, nextEvent /*: AtomWatcherEvent */) /*: boolean %checks */ {
  return (
    nextEvent.oldPath != null &&
    (previousIncomplete.event.path + path.sep).startsWith(nextEvent.oldPath + path.sep)
  )
}

function itemDestinationWasDeleted (item /*: IncompleteItem */, event /*: AtomWatcherEvent */) /*: boolean %checks */ {
  return !!(
    event.action === 'deleted' &&
    item.event.oldPath &&
    (item.event.path + path.sep).startsWith(event.path + path.sep)
  )
}

async function rebuildIncompleteEvent (item /*: IncompleteItem */, event /*: AtomWatcherEvent */, opts /*: { syncPath: string , checksumer: Checksumer } */) /*: Promise<AtomWatcherEvent> */ {
  // $FlowFixMe: Renamed events always have an oldPath
  const p = item.event.path.replace(event.oldPath, event.path)
  const absPath = path.join(opts.syncPath, p)
  const stats = await stater.stat(absPath)
  const kind = stater.kind(stats)
  let md5sum
  if (kind === 'file') {
    md5sum = await opts.checksumer.push(absPath)
  }
  let oldPath

  if (item.event.oldPath) {
    oldPath = p === event.path
      ? item.event.oldPath
      // $FlowFixMe: Renamed events always have an oldPath
      : item.event.oldPath.replace(event.oldPath, event.path)
  }
  return {
    action: item.event.action,
    oldPath,
    path: p,
    _id: metadata.id(p),
    kind,
    stats,
    md5sum
  }
}

function buildDeletedFromRenamed (item /*: IncompleteItem */, event /*: AtomWatcherEvent */) /*: AtomWatcherEvent */ {
  const { oldPath, kind } = item.event
  return {
    action: event.action,
    // $FlowFixMe: renamed events always have an oldPath
    path: oldPath,
    // $FlowFixMe: renamed events always have an oldPath
    _id: metadata.id(oldPath),
    kind
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
function loop (buffer /*: Buffer */, opts /*: IncompleteFixerOptions */) /*: Buffer */ {
  const incompletes = []
  return buffer.asyncMap(step(incompletes, opts))
}

function step (incompletes /*: IncompleteItem[] */, opts /*: IncompleteFixerOptions */) {
  return async (events /*: Batch */) /*: Promise<Batch> */ => {
    // Filter out the incomplete events
    const batch = []
    for (const event of events) {
      if (event.incomplete) {
        log.debug({path: event.path, action: event.action}, 'incomplete')
        incompletes.push({ event, timestamp: Date.now() })
        continue
      }
      batch.push(event)
    }

    // Let's see if we can match an incomplete event with this renamed event
    for (const event of batch) {
      if (incompletes.length === 0 || !['renamed', 'deleted'].includes(event.action)) {
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

        try {
          if (wasRenamedSuccessively(item, event)) {
            // We have a match, try to rebuild the incomplete event
            const rebuilt = await rebuildIncompleteEvent(item, event, opts)
            log.debug({path: rebuilt.path, action: rebuilt.action}, 'rebuilt event')
            if (rebuilt.action === 'renamed' && rebuilt.path === event.path) {
              batch.splice(batch.indexOf(event), 1, rebuilt)
            } else {
              batch.push(rebuilt)
            }
          } else if (itemDestinationWasDeleted(item, event)) {
            // We have a match, try to replace the incomplete event
            const rebuilt = buildDeletedFromRenamed(item, event)
            log.debug({path: rebuilt.path, action: rebuilt.action}, 'rebuilt event')
            batch.push(rebuilt)
          } else {
            continue
          }

          incompletes.splice(i, 1)
          break
        } catch (err) {
          log.error({err, event, item}, 'Could not rebuild incomplete event')
          // If we have an error, there is probably not much that we can do
        }
      }
    }

    return batch
  }
}
