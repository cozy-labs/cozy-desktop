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
import type Channel from './channel'
import type { AtomEvent, AtomBatch } from './event'
import type { Checksumer } from '../checksumer'

type IncompleteItem = {
  event: AtomEvent,
  timestamp: number,
}

type IncompleteFixerOptions = {
  syncPath: string,
  checksumer: Checksumer
}

type Completion =
  | { ignored: false, rebuilt: AtomEvent }
  | { ignored: true }
*/

module.exports = {
  loop,
  step
}

function wasRenamedSuccessively(
  previousEvent /*: AtomEvent */,
  nextEvent /*: AtomEvent */
) /*: boolean %checks */ {
  return (
    nextEvent.oldPath != null &&
    (previousEvent.path + path.sep).startsWith(nextEvent.oldPath + path.sep)
  )
}

function itemDestinationWasDeleted(
  previousEvent /*: AtomEvent */,
  nextEvent /*: AtomEvent */
) /*: boolean %checks */ {
  return !!(
    nextEvent.action === 'deleted' &&
    previousEvent.oldPath &&
    (previousEvent.path + path.sep).startsWith(nextEvent.path + path.sep)
  )
}

function completeEventPaths(
  previousEvent /*: AtomEvent */,
  nextEvent /*: AtomEvent */
) /*: { path: string, oldPath?: string } */ {
  // $FlowFixMe: `renamed` events always have oldPath
  const path = previousEvent.path.replace(nextEvent.oldPath, nextEvent.path)

  if (previousEvent.oldPath) {
    return {
      path,
      oldPath:
        path === nextEvent.path
          ? previousEvent.oldPath
          : // $FlowFixMe: `renamed` events always have oldPath
            previousEvent.oldPath.replace(nextEvent.oldPath, nextEvent.path)
    }
  } else {
    return { path }
  }
}

async function rebuildIncompleteEvent(
  previousEvent /*: AtomEvent */,
  nextEvent /*: AtomEvent */,
  opts /*: { syncPath: string , checksumer: Checksumer } */
) /*: Promise<Completion> */ {
  const { path: relPath, oldPath } = completeEventPaths(
    previousEvent,
    nextEvent
  )

  if (relPath === oldPath) {
    return { ignored: true }
  }

  const absPath = path.join(opts.syncPath, relPath)
  const stats = await stater.statMaybe(absPath)
  const incomplete = stats == null
  const kind = stats ? stater.kind(stats) : previousEvent.kind
  const md5sum =
    stats && kind === 'file' ? await opts.checksumer.push(absPath) : undefined

  const rebuilt /*: AtomEvent */ = {
    [STEP_NAME]: {
      incompleteEvent: previousEvent,
      completingEvent: nextEvent
    },
    action: previousEvent.action,
    path: relPath,
    _id: metadata.id(relPath),
    kind,
    md5sum
  }
  if (oldPath) rebuilt.oldPath = oldPath
  if (stats) rebuilt.stats = stats
  if (incomplete) rebuilt.incomplete = incomplete

  return { rebuilt, ignored: false }
}

function buildDeletedFromRenamed(
  previousEvent /*: AtomEvent */,
  nextEvent /*: AtomEvent */
) /*: Completion */ {
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
function loop(
  channel /*: Channel */,
  opts /*: IncompleteFixerOptions */
) /*: Channel */ {
  const incompletes = []
  return channel.asyncMap(step(incompletes, opts))
}

function step(
  incompletes /*: IncompleteItem[] */,
  opts /*: IncompleteFixerOptions */
) {
  return async (events /*: AtomBatch */) /*: Promise<AtomBatch> */ => {
    const batch = []

    // Filter incomplete events
    for (const event of events) {
      if (event.incomplete && event.action !== 'ignored') {
        log.debug({ path: event.path, action: event.action }, 'incomplete')
        incompletes.push({ event, timestamp: Date.now() })
      }
    }

    // Let's see if we can match an incomplete event with a renamed or deleted event
    for (const event of events) {
      if (
        incompletes.length === 0 ||
        !['renamed', 'deleted'].includes(event.action)
      ) {
        if (!event.incomplete) {
          batch.push(event)
        }
        continue
      }

      const now = Date.now()
      for (let i = 0; i < incompletes.length; i++) {
        const item = incompletes[i]

        // Remove the expired incomplete events
        if (item.timestamp + DELAY < now) {
          log.debug({ event: item.event }, 'Dropping expired incomplete event')
          incompletes.splice(i, 1)
          i--
          continue
        }

        try {
          const completion = await detectCompletion(item.event, event, opts)
          if (!completion) {
            if (!event.incomplete) {
              batch.push(event)
            }
            continue
          } else if (completion.ignored) {
            break
          }

          const { rebuilt } = completion
          log.debug(
            { path: rebuilt.path, action: rebuilt.action },
            'rebuilt event'
          )

          if (rebuilt.incomplete) {
            incompletes.splice(i, 1, { event: rebuilt, timestamp: Date.now() })
            continue
          }

          if (rebuilt.path.startsWith(event.path + path.sep)) {
            batch.push(event) // Could we be pushing it multiple times?
          }
          batch.push(rebuilt)
          incompletes.splice(i, 1)
          break
        } catch (err) {
          log.error(
            { err, event, item },
            'Error while rebuilding incomplete event'
          )
          // If we have an error, there is probably not much that we can do
        }
      }
    }

    return batch
  }
}

async function detectCompletion(
  previousEvent /*: AtomEvent */,
  nextEvent /*: AtomEvent */,
  opts /*: IncompleteFixerOptions */
) /*: Promise<?Completion> */ {
  if (wasRenamedSuccessively(previousEvent, nextEvent)) {
    // We have a match, try to rebuild the incomplete event
    return rebuildIncompleteEvent(previousEvent, nextEvent, opts)
  } else if (itemDestinationWasDeleted(previousEvent, nextEvent)) {
    // We have a match, try to replace the incomplete event
    return buildDeletedFromRenamed(previousEvent, nextEvent)
  }
}
