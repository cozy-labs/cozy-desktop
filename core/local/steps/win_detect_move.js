/* @flow */

const _ = require('lodash')
const path = require('path')

const SortedSet = require('../../utils/sorted_set')
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

type PendingItem = {
  event: AtomWatcherEvent,
  deletedIno: ?string | ?number,
  timeout: TimeoutID
}

export type WinDetectMoveState = {
  [typeof STEP_NAME]: {
    unmergedRenamedEvents: SortedSet<AtomWatcherEvent>
  }
}

type WinDetectMoveOptions = {
  pouch: Pouch,
  state: WinDetectMoveState
}
*/

module.exports = {
  initialState,
  loop,
  onEventMerged
}

const areParentChildPaths = (p /*: string */, c /*: string */) /*: boolean */ =>
  `${c}${path.sep}`.startsWith(`${p}${path.sep}`)

async function initialState (opts /*: ?{} */) /* Promise<WinDetectMoveState> */ {
  return {
    [STEP_NAME]: {
      unmergedRenamedEvents: new SortedSet/* ::<AtomWatcherEvent> */()
    }
  }
}

function onEventMerged (event /*: AtomWatcherEvent */, state /*: WinDetectMoveState */) {
  const { [STEP_NAME]: { unmergedRenamedEvents } } = state

  unmergedRenamedEvents.delete(event)
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

async function findDeleted (event, pouch, unmergedRenamedEvents) {
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
        if (was.path !== event.path) {
          // TODO: Attach renamed chain info?
          _.set(event, [STEP_NAME, 'wasPath'], was.path)
        }
        return was.fileid || was.ino
      } else {
        _.set(event, [STEP_NAME, 'docNotFound'], 'missing')
      }
    } finally {
      release()
    }
  }
}

function aggregateEvents (event, pendingItems, unmergedRenamedEvents) {
  if (event.incomplete || event.action !== 'created') {
    return
  }

  for (let i = 0; i < pendingItems.length; i++) {
    const pendingItem = pendingItems[i]
    if (!pendingItem.deletedIno) continue
    if (![event.stats.fileid, event.stats.ino].includes(pendingItem.deletedIno)) continue

    const deletedEvent = pendingItem.event
    const aggregatedEvents = {
      deletedEvent,
      createdEvent: _.clone(event)
    }
    event.action = 'renamed'
    event.oldPath = deletedEvent.path
    _.set(event, [STEP_NAME, 'aggregatedEvents'], aggregatedEvents)
    clearTimeout(pendingItem.timeout)
    pendingItems.splice(i, 1)
    unmergedRenamedEvents.add(event)
    break
  }
}

function sendReadyBatches (waiting /*: PendingItem[] */, out /*: Buffer */) {
  while (waiting.length > 0) {
    if (waiting[0].deletedIno) {
      break
    }
    const item = waiting.shift()
    clearTimeout(item.timeout)
    out.push([item.event])
  }
}

// On windows, ReadDirectoryChangesW emits a deleted and an added events when
// a file or directory is moved. This step merges the two events to a single
// renamed event.
async function winDetectMove (buffer, out, opts /*: WinDetectMoveOptions */) {
  const pendingItems /*: PendingItem[] */ = []

  while (true) {
    // Wait for a new batch of events
    const events = await buffer.pop()
    const {
      pouch,
      state: { [STEP_NAME]: { unmergedRenamedEvents } }
    } = opts

    for (const event of events) {
      // First, push the new events in the pending queue
      const deletedIno = await findDeleted(event, pouch, unmergedRenamedEvents)
      const timeout = setTimeout(() => {
        out.push([pendingItems.shift().event])
        sendReadyBatches(pendingItems, out)
      }, DELAY)
      pendingItems.push({ event, deletedIno, timeout })

      // Then, see if a created event matches a deleted event
      aggregateEvents(event, pendingItems, unmergedRenamedEvents)
    }

    // Finally, look if some batches can be sent without waiting
    sendReadyBatches(pendingItems, out)
  }
}

function loop (buffer /*: Buffer */, opts /*: WinDetectMoveOptions */) /*: Buffer */ {
  const out = new Buffer()
  winDetectMove(buffer, out, opts)
    .catch(err => log.error({err}))
  return out
}
