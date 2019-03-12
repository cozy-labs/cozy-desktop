/* @flow */

const path = require('path')

const stater = require('../stater')
const metadata = require('../../metadata')
const logger = require('../../logger')

const STEP_NAME = 'incompleteFixer'

const log = logger({
  component: `atom/${STEP_NAME}`
})

// Drop incomplete events after this delay (in milliseconds).
// TODO tweak the value (the initial value was chosen because it looks like a
//      good value, it is not something that was computed)
const DELAY = 3000

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

type Completion =
  | { ignored: false, rebuilt: AtomWatcherEvent }
  | { ignored: true }
*/

module.exports = {
  loop,
  step
}

function wasRenamedSuccessively (previousEvent /*: AtomWatcherEvent */, nextEvent /*: AtomWatcherEvent */) /*: boolean %checks */ {
  return (
    nextEvent.oldPath != null &&
    (previousEvent.path + path.sep).startsWith(nextEvent.oldPath + path.sep)
  )
}

function itemDestinationWasDeleted (previousEvent /*: AtomWatcherEvent */, nextEvent /*: AtomWatcherEvent */) /*: boolean %checks */ {
  return !!(
    nextEvent.action === 'deleted' &&
    previousEvent.oldPath &&
    (previousEvent.path + path.sep).startsWith(nextEvent.path + path.sep)
  )
}

function completeEventPaths (previousEvent /*: AtomWatcherEvent */, nextEvent /*: AtomWatcherEvent */) /*: { path: string, oldPath?: string } */ {
  // $FlowFixMe: `renamed` events always have oldPath
  const path = previousEvent.path.replace(nextEvent.oldPath, nextEvent.path)

  if (previousEvent.oldPath) {
    return {
      path,
      oldPath: path === nextEvent.path
        ? previousEvent.oldPath
        // $FlowFixMe: `renamed` events always have oldPath
        : previousEvent.oldPath.replace(nextEvent.oldPath, nextEvent.path)
    }
  } else {
    return { path }
  }
}

async function rebuildIncompleteEvent (previousEvent /*: AtomWatcherEvent */, nextEvent /*: AtomWatcherEvent */, opts /*: { syncPath: string , checksumer: Checksumer } */) /*: Promise<Completion> */ {
  const { path: relPath, oldPath } = completeEventPaths(previousEvent, nextEvent)

  if (relPath === oldPath) {
    return { ignored: true }
  }

  const absPath = path.join(opts.syncPath, relPath)
  const stats = await stater.stat(absPath)
  const kind = stater.kind(stats)
  const md5sum = kind === 'file'
    ? await opts.checksumer.push(absPath)
    : undefined

  return {
    ignored: false,
    rebuilt: {
      [STEP_NAME]: {
        incompleteEvent: previousEvent,
        completingEvent: nextEvent
      },
      action: previousEvent.action,
      oldPath,
      path: relPath,
      _id: metadata.id(relPath),
      kind,
      stats,
      md5sum
    }
  }
}

function buildDeletedFromRenamed (previousEvent /*: AtomWatcherEvent */, nextEvent /*: AtomWatcherEvent */) /*: Completion */ {
  const { oldPath, kind } = previousEvent
  return {
    ignored: false,
    rebuilt: {
      [STEP_NAME]: {
        incompleteEvent: previousEvent,
        completingEvent: nextEvent
      },
      action: nextEvent.action,
      // $FlowFixMe: renamed events always have an oldPath
      path: oldPath,
      // $FlowFixMe: renamed events always have an oldPath
      _id: metadata.id(oldPath),
      kind
    }
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
          log.debug({event: item.event}, 'Dropping expired incomplete event')
          incompletes.splice(i, 1)
          i--
          continue
        }

        try {
          const completion = await detectCompletion(item.event, event, opts)
          if (!completion) {
            continue
          } else if (completion.ignored) {
            batch.splice(batch.indexOf(event), 1)
            break
          }

          const { rebuilt } = completion
          log.debug({path: rebuilt.path, action: rebuilt.action}, 'rebuilt event')

          if (rebuilt.path === event.path) {
            batch.splice(batch.indexOf(event), 1, rebuilt)
          } else {
            batch.push(rebuilt)
          }

          incompletes.splice(i, 1)

          break
        } catch (err) {
          log.error({err, event, item}, 'Error while rebuilding incomplete event')
          // If we have an error, there is probably not much that we can do
        }
      }
    }

    return batch
  }
}

async function detectCompletion (previousEvent /*: AtomWatcherEvent */, nextEvent /*: AtomWatcherEvent */, opts /*: IncompleteFixerOptions */) /*: Promise<?Completion> */ {
  if (wasRenamedSuccessively(previousEvent, nextEvent)) {
    // We have a match, try to rebuild the incomplete event
    return rebuildIncompleteEvent(previousEvent, nextEvent, opts)
  } else if (itemDestinationWasDeleted(previousEvent, nextEvent)) {
    // We have a match, try to replace the incomplete event
    return buildDeletedFromRenamed(previousEvent, nextEvent)
  }
}
