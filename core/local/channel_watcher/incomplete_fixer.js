/** Try to fix incomplete events from previous steps.
 *
 * When a file is added or updated, and it is moved just after, the first
 * event is marked as incomplete by addChecksum because we cannot compute the
 * checksum at the given path. But the event is still relevant, in particular
 * if a directory that is an ancestor of this file has been moved. With the
 * renamed event, by comparing the path, we can extrapolate the new path and
 * check with fs.stats if we have a file here.
 *
 * Cf test/property/local_watcher/swedish_krona.json
 *
 * @module core/local/channel_watcher/incomplete_fixer
 * @flow
 */

const path = require('path')

const stater = require('../stater')
const { logger } = require('../../utils/logger')

const STEP_NAME = 'incompleteFixer'

const log = logger({
  component: `ChannelWatcher/${STEP_NAME}`
})

/** Drop incomplete events after this delay (in milliseconds).
 *
 * TODO: tweak the value (the initial value was chosen because it looks like a
 * good value, it is not something that was computed).
 */
const DELAY = 3000

/*::
import type Channel from './channel'
import type { ChannelEvent, ChannelBatch } from './event'
import type { Checksumer } from '../checksumer'
import type { Config } from '../../config'
import type { Pouch } from '../../pouch'
import type { Metadata } from '../../metadata'

type IncompleteItem = {
  event: ChannelEvent,
  timestamp: number,
}

type IncompleteFixerOptions = {
  config: Config,
  checksumer: Checksumer,
  pouch: Pouch,
  fatal: Error => any,
}

type Completion =
  | {| rebuilt: ChannelEvent |}
  | {| ignored: true |}
*/

module.exports = {
  loop,
  step
}

function wasRenamedSuccessively(
  previousEvent /*: ChannelEvent */,
  nextEvent /*: ChannelEvent */
) /*: boolean %checks */ {
  return (
    nextEvent.oldPath != null &&
    (previousEvent.path + path.sep).startsWith(nextEvent.oldPath + path.sep)
  )
}

function itemDestinationWasDeleted(
  previousEvent /*: ChannelEvent */,
  nextEvent /*: ChannelEvent */
) /*: boolean %checks */ {
  return !!(
    nextEvent.action === 'deleted' &&
    previousEvent.oldPath &&
    (previousEvent.path + path.sep).startsWith(nextEvent.path + path.sep)
  )
}

function renamedItemWasReplaced(
  previousEvent /*: ChannelEvent */,
  nextEvent /*: ChannelEvent */
) /*: boolean %checks */ {
  return !!(
    nextEvent.action === 'created' &&
    previousEvent.oldPath &&
    nextEvent.path === previousEvent.oldPath &&
    nextEvent.kind === previousEvent.kind
  )
}

function completeEventPaths(
  previousEvent /*: ChannelEvent */,
  nextEvent /*: ChannelEvent */
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
  previousEvent /*: ChannelEvent */,
  nextEvent /*: ChannelEvent */,
  opts /*: { config: Config , checksumer: Checksumer, pouch: Pouch } */
) /*: Promise<Completion> */ {
  const { path: rebuiltPath, oldPath: rebuiltOldPath } = completeEventPaths(
    previousEvent,
    nextEvent
  )

  if (rebuiltPath === rebuiltOldPath) {
    return { ignored: true }
  }

  const absPath = path.join(opts.config.syncPath, rebuiltPath)
  const stats = await stater.statMaybe(absPath)
  const incomplete = stats == null
  const kind = stats ? stater.kind(stats) : previousEvent.kind
  const md5sum =
    stats && kind === 'file' ? await opts.checksumer.push(absPath) : undefined

  const rebuilt /*: ChannelEvent */ = {
    [STEP_NAME]: {
      incompleteEvent: previousEvent,
      completingEvent: nextEvent
    },
    action: previousEvent.action,
    path: rebuiltPath,
    kind,
    md5sum
  }
  if (rebuiltOldPath) rebuilt.oldPath = rebuiltOldPath
  if (stats) rebuilt.stats = stats
  if (incomplete) rebuilt.incomplete = incomplete

  return { rebuilt }
}

function buildDeletedFromRenamed(
  previousEvent /*: ChannelEvent */,
  nextEvent /*: ChannelEvent */
) /*: Completion */ {
  const { oldPath, kind } = previousEvent
  return {
    rebuilt: {
      [STEP_NAME]: {
        incompleteEvent: previousEvent,
        completingEvent: nextEvent
      },
      action: nextEvent.action,
      // $FlowFixMe: renamed events always have an oldPath
      path: oldPath,
      kind
    }
  }
}

function buildModifiedFromRenamed(
  previousEvent /*: ChannelEvent */,
  nextEvent /*: ChannelEvent */
) /*: Completion */ {
  return {
    rebuilt: {
      ...nextEvent,
      action: 'modified',
      [STEP_NAME]: {
        incompleteEvent: previousEvent,
        completingEvent: nextEvent
      }
    }
  }
}

function keepEvent(event, { incompletes, batch }) {
  if (event.incomplete) {
    incompletes.add({ event, timestamp: Date.now() })
  } else {
    batch.add(event)
  }
}

function loop(
  channel /*: Channel */,
  opts /*: IncompleteFixerOptions */
) /*: Channel */ {
  const incompletes = []
  return channel.asyncMap(step({ incompletes }, opts), opts.fatal)
}

function step(
  state /*: { incompletes: IncompleteItem[] } */,
  opts /*: IncompleteFixerOptions */
) {
  return async (events /*: ChannelBatch */) /*: Promise<ChannelBatch> */ => {
    const batch = new Set()

    // Filter incomplete events
    for (const event of events) {
      if (event.incomplete && event.action !== 'ignored') {
        log.debug('incomplete', { path: event.path, action: event.action })
        state.incompletes.push({ event, timestamp: Date.now() })
      }
    }

    // Let's see if we can match an incomplete event with a renamed or deleted event
    for (const event of events) {
      const now = Date.now()
      for (let i = 0; i < state.incompletes.length; i++) {
        const item = state.incompletes[i]

        // Remove the expired incomplete events
        if (item.timestamp + DELAY < now) {
          log.debug('Dropping expired incomplete event', {
            path: item.event.path,
            event: item.event
          })
          state.incompletes.splice(i, 1)
          i--
        }
      }

      if (
        state.incompletes.length === 0 ||
        !['renamed', 'deleted', 'created'].includes(event.action)
      ) {
        if (!event.incomplete) {
          batch.add(event)
        }
        continue
      }

      const incompletes = new Set()
      for (let i = 0; i < state.incompletes.length; i++) {
        const item = state.incompletes[i]

        try {
          const completion = await detectCompletion(item.event, event, opts)
          if (!completion) {
            incompletes.add(item)
            if (!event.incomplete) {
              batch.add(event)
            }
            continue
          } else if (completion.ignored) {
            incompletes.add(item)
            continue
          }

          const { rebuilt } = completion
          log.debug('rebuilt event', { path: event.path, rebuilt })

          // If the incomplete event is for a document that was previously saved
          // (e.g. a temporary document now renamed), we'll want to make sure the old
          // document is removed to avoid having 2 documents with the same inode.
          // We can do this by keeping the completing renamed event.
          const incompleteForExistingDoc /*: ?Metadata */ =
            await opts.pouch.byLocalPath(item.event.path)
          if (
            incompleteForExistingDoc &&
            !incompleteForExistingDoc.trashed &&
            (item.event.action === 'created' || item.event.action === 'scan')
          ) {
            // Simply drop the incomplete event since we already have a document at this
            // path in Pouch.
            keepEvent(event, { incompletes, batch })
          } else if (
            incompleteForExistingDoc &&
            !incompleteForExistingDoc.trashed &&
            item.event.action === 'modified'
          ) {
            // Keep the completed modified event to make sure we don't miss any
            // content changes but process the completing event (i.e. probably a
            // renamed event) to make sure we apply the modifications on the right
            // document.
            keepEvent(event, { incompletes, batch })
            keepEvent(rebuilt, { incompletes, batch })
          } else if (rebuilt.path.startsWith(event.path + path.sep)) {
            // Keep the completing event if it's the parent of the completed event since
            // they don't apply to the same document.
            keepEvent(event, { incompletes, batch })
            keepEvent(rebuilt, { incompletes, batch })
          } else {
            keepEvent(rebuilt, { incompletes, batch })
          }

          if (rebuilt.incomplete) {
            // The rebuilt being incomplete, we'll keep it in the list of
            // incompletes and should replace the existing incomplete event
            // since it was still rebuilt.
            state.incompletes.splice(i, 1)
          }
        } catch (err) {
          log.warn('Error while rebuilding incomplete event', {
            err,
            event,
            item
          })
          // If we have an error, there is probably not much that we can do
        }
      }
      // Replace the state's incompletes with the newly built set.
      state.incompletes.length = 0
      state.incompletes.push(...incompletes)
    }

    return Array.from(batch)
  }
}

async function detectCompletion(
  previousEvent /*: ChannelEvent */,
  nextEvent /*: ChannelEvent */,
  opts /*: IncompleteFixerOptions */
) /*: Promise<?Completion> */ {
  if (wasRenamedSuccessively(previousEvent, nextEvent)) {
    // We have a match, try to rebuild the incomplete event
    return rebuildIncompleteEvent(previousEvent, nextEvent, opts)
  } else if (itemDestinationWasDeleted(previousEvent, nextEvent)) {
    // We have a match, try to replace the incomplete event
    return buildDeletedFromRenamed(previousEvent, nextEvent)
  } else if (renamedItemWasReplaced(previousEvent, nextEvent)) {
    return buildModifiedFromRenamed(previousEvent, nextEvent)
  }
}
