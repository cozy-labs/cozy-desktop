/* @flow */

const _ = require('lodash')
const path = require('path')

const { id } = require('../../metadata')
const Buffer = require('./buffer')
const logger = require('../../logger')

const STEP_NAME = 'winDetectMove'

const log = logger({
  component: `atom/${STEP_NAME}`
})

// Wait at most this delay (in milliseconds) to see if it's a move.
// TODO tweak the value (the initial value was chosen because it looks like a
//      good value, it is not something that was computed)
const DELAY = 1000

/*::
import type { AtomWatcherEvent } from './event'
import type Pouch from '../../pouch'

type PendingBatch = {
  events: AtomWatcherEvent[],
  deleted: Map<string | number, string>,
  timeout: TimeoutID
}

export type WinDetectMoveState = {
  [typeof STEP_NAME]: {
    unmergedRenamedEvents: AtomWatcherEvent[]
  }
}

type WinDetectMoveOptions = {
  pouch: Pouch,
  state: WinDetectMoveState
}
*/

module.exports = {
  initialState,
  loop
}

const areParentChildPaths = (p /*: string */, c /*: string */) /*: boolean */ =>
  `${c}${path.sep}`.startsWith(`${p}${path.sep}`)

async function initialState (opts /*: ?{} */) /* Promise<WinDetectMoveState> */ {
  return {
    [STEP_NAME]: {
      unmergedRenamedEvents: []
    }
  }
}

function previousPaths (deletedPath, unmergedRenamedEvents) {
  const { previous: previousPaths } =
    unmergedRenamedEvents.reduceRight/* ::<{ previous: string[], current: string }> */(
      (paths, renamedEvent) => {
        if (renamedEvent.oldPath && areParentChildPaths(renamedEvent.path, paths.current)) {
          paths.current = paths.current.replace(renamedEvent.path, renamedEvent.oldPath)
          paths.previous.unshift(paths.current)
        }
        return paths
      },
      {
        current: deletedPath,
        previous: []
      }
    )
  return previousPaths
}

async function findDocFromPreviousPaths (previousPaths, pouch) {
  for (const previousPath of previousPaths) {
    const doc = await pouch.byIdMaybeAsync(id(previousPath))
    if (doc) return doc
  }
}

async function findDeleted (events, pouch, unmergedRenamedEvents) {
  const deleted = new Map()
  for (const event of events) {
    if (event.action === 'deleted') {
      const release = await pouch.lock('winMoveDetector')
      try {
        const was = (
          await pouch.byIdMaybeAsync(event._id) ||
          await findDocFromPreviousPaths(
            previousPaths(event.path, unmergedRenamedEvents),
            pouch
          )
        )
        if (was) {
          deleted.set(was.fileid || was.ino, event.path)
          if (was.path !== event.path) {
            // TODO: Attach renamed chain info?
            _.set(event, [STEP_NAME, 'wasPath'], was.path)
          }
        } else {
          _.set(event, [STEP_NAME, 'docNotFound'], 'missing')
        }
      } finally {
        release()
      }
    }
  }
  return deleted
}

function aggregateEvents (events, pending, unmergedRenamedEvents) {
  for (const event of events) {
    if (event.incomplete) {
      continue
    }
    if (event.action === 'created') {
      for (let i = 0; i < pending.length; i++) {
        let path = pending[i].deleted.get(event.stats.fileid)
        if (!path) {
          path = pending[i].deleted.get(event.stats.ino)
        }

        if (!path || path === event.path) {
          continue
        }
        const l = pending[i].events.length
        for (let j = 0; j < l; j++) {
          const e = pending[i].events[j]
          if (e.action === 'deleted' && e.path === path) {
            const aggregatedEvents = {
              deletedEvent: e,
              createdEvent: _.clone(event)
            }
            event.action = 'renamed'
            event.oldPath = e.path
            _.set(event, [STEP_NAME, 'aggregatedEvents'], aggregatedEvents)
            pending[i].deleted.delete(event.stats.fileid)
            pending[i].deleted.delete(event.stats.ino)
            pending[i].events.splice(j, 1)
            unmergedRenamedEvents.push(event)
            break
          }
        }
      }
    }
  }
}

function sendReadyBatches (waiting /*: PendingBatch[] */, out /*: Buffer */) {
  while (waiting.length > 0) {
    if (waiting[0].deleted.size !== 0) {
      break
    }
    const item = waiting.shift()
    clearTimeout(item.timeout)
    out.push(item.events)
  }
}

// On windows, ReadDirectoryChangesW emits a deleted and an added events when
// a file or directory is moved. This step merges the two events to a single
// renamed event.
async function winDetectMove (buffer, out, opts /*: WinDetectMoveOptions */) {
  const pending /*: PendingBatch[] */ = []

  while (true) {
    // Wait for a new batch of events
    const events = await buffer.pop()
    const {
      pouch,
      state: { [STEP_NAME]: { unmergedRenamedEvents } }
    } = opts

    // First, push the new events in the pending queue
    const deleted = await findDeleted(events, pouch, unmergedRenamedEvents)
    const timeout = setTimeout(() => {
      out.push(pending.shift().events)
      sendReadyBatches(pending, out)
    }, DELAY)
    pending.push({ events, deleted, timeout })

    // Then, see if a created event matches a deleted event
    aggregateEvents(events, pending, unmergedRenamedEvents)

    // Finally, look if some batches can be sent without waiting
    sendReadyBatches(pending, out)
  }
}

function loop (buffer /*: Buffer */, opts /*: WinDetectMoveOptions */) /*: Buffer */ {
  const out = new Buffer()
  winDetectMove(buffer, out, opts)
    .catch(err => log.error({err}))
  return out
}
