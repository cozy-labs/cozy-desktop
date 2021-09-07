/** This step aggregates deleted & added events into renamed ones on Windows.
 *
 * On windows, ReadDirectoryChangesW emits a deleted and an added events when
 * a file or directory is moved. This step merges the two events to a single
 * renamed event.
 *
 * @module core/local/atom/win_detect_move
 * @flow
 */

const _ = require('lodash')
const path = require('path')

const SortedSet = require('../../utils/sorted_set')
const Channel = require('./channel')
const logger = require('../../utils/logger')

const STEP_NAME = 'winDetectMove'

const log = logger({
  component: `atom/${STEP_NAME}`
})

/** Wait at most this delay (in milliseconds) to see if it's a move.
 *
 * TODO: tweak the value (the initial value was chosen because it looks like a
 * good value, it is not something that was computed).
 */
const DELAY = 1000

/*::
import type { AtomEvent, AtomBatch } from './event'
import type { Pouch } from '../../pouch'
import type { Metadata } from '../../metadata'

type PendingItem = {
  event: AtomEvent,
  deletedIno: ?string | ?number,
  timeout: TimeoutID
}

export type WinDetectMoveState = {
  [typeof STEP_NAME]: {
    pendingItems: PendingItem[],
    unmergedRenamedEvents: SortedSet<AtomEvent>
  }
}

type WinDetectMoveOptions = {
  pouch: Pouch,
  state: WinDetectMoveState
}
*/

module.exports = {
  forget,
  initialState,
  loop
}

const areParentChildPaths = (p /*: string */, c /*: string */) /*: boolean */ =>
  `${c}${path.sep}`.startsWith(`${p}${path.sep}`)

async function initialState() /* Promise<WinDetectMoveState> */ {
  return {
    [STEP_NAME]: {
      pendingItems: [],
      // eslint-disable-next-line
      unmergedRenamedEvents: new SortedSet /*:: <AtomEvent> */ ()
    }
  }
}

function forget(event /*: AtomEvent */, state /*: WinDetectMoveState */) {
  const {
    [STEP_NAME]: { unmergedRenamedEvents }
  } = state

  unmergedRenamedEvents.delete(event)
}

function previousPaths(deletedPath, unmergedRenamedEvents) {
  const { previous: previousPaths } = unmergedRenamedEvents.reduceRight(
    (paths, renamedEvent) => {
      if (
        renamedEvent.oldPath &&
        areParentChildPaths(renamedEvent.path, paths.current)
      ) {
        paths.current = paths.current.replace(
          renamedEvent.path,
          renamedEvent.oldPath
        )
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

async function findDeletedInoByPath(
  dpath,
  pouch
) /*: Promise<?{ deletedIno: ?number|string }> */ {
  const doc /*: ?Metadata */ = await pouch.byLocalPath(dpath)
  if (doc) {
    return { deletedIno: doc.local.fileid || doc.local.ino }
  }
}

async function findDeletedInoRecentlyRenamed(
  previousPaths,
  pouch
) /*: Promise<?{ deletedIno: ?number|string, oldPaths: string[] }> */ {
  for (const [index, previousPath] of previousPaths.entries()) {
    const doc /*: ?Metadata */ = await pouch.byLocalPath(previousPath)
    if (doc) {
      return {
        deletedIno: doc.local.fileid || doc.local.ino,
        oldPaths: previousPaths.slice(index)
      }
    }
  }
}

async function findDeletedIno(
  event,
  pouch,
  unmergedRenamedEvents
) /*: { deletedIno?: number|string, oldPaths?: string[] } */ {
  if (event.action !== 'deleted') return {}
  if (event.deletedIno != null) return { deletedIno: event.deletedIno }

  // OPTIMIZE: Make .previousPaths() include event.path so we don't need a lock
  const release = await pouch.lock('winDetectMove')
  try {
    return (
      (await findDeletedInoByPath(event.path, pouch)) ||
      (await findDeletedInoRecentlyRenamed(
        previousPaths(event.path, unmergedRenamedEvents),
        pouch
      )) ||
      {}
    )
  } finally {
    release()
  }
}

async function assignDebugInfos(event, found) {
  if (event.action !== 'deleted') return
  if (found.oldPaths) {
    _.set(event, [STEP_NAME, 'oldPaths'], found.oldPaths)
  } else if (!found.deletedIno) {
    _.set(event, [STEP_NAME, 'deletedIno'], 'unresolved')
  }
}

function eventHasIno(event, ino) {
  return event.stats && ino === (event.stats.fileid || event.stats.ino)
}

/*
 * Try to match created and deleted events with the same inode (or deleted inode
 * respectively).
 *
 * If a pending created event can be matched with a more recent deleted event,
 * this means the created document has been deleted and we can aggregate the
 * events into an ignored event.
 *
 * If a pending deleted event can be matched with a more recent created event,
 * this probably means the deleted document was actually moved and we can
 * aggregate the events into a renamed event.
 * However, if both events have the exact same path, this is not a move! It's
 * possibly the events fired by the local application of a remote update though.
 * In any case, they should not be aggregated.
 */
function indexOfMatchingEvent(event, pendingItems, deletedIno) {
  if (event.action === 'created' && !event.incomplete) {
    for (let i = 0; i < pendingItems.length; i++) {
      const { deletedIno, event: pendingEvent } = pendingItems[i]
      if (
        deletedIno &&
        eventHasIno(event, deletedIno) &&
        event.path !== pendingEvent.path
      ) {
        return i
      }
    }
  } else if (event.action === 'deleted') {
    for (let i = 0; i < pendingItems.length; i++) {
      const { event: createdEvent } = pendingItems[i]
      if (
        createdEvent.action === 'created' &&
        !createdEvent.incomplete &&
        deletedIno &&
        eventHasIno(createdEvent, deletedIno)
      ) {
        return i
      }
    }
  }
  return -1
}

function aggregateEvents(createdEvent, deletedEvent) {
  const aggregatedEvents = {
    deletedEvent,
    createdEvent: _.clone(createdEvent)
  }
  if (createdEvent.path !== deletedEvent.path) {
    createdEvent.action = 'renamed'
    createdEvent.oldPath = deletedEvent.path
  } else {
    createdEvent.action = 'ignored'
  }
  _.set(createdEvent, [STEP_NAME, 'aggregatedEvents'], aggregatedEvents)
}

function sendReadyBatches(
  waiting /*: PendingItem[] */,
  output /*: (AtomBatch) => void */
) {
  while (waiting.length > 0) {
    if (waiting[0].deletedIno || waiting[0].event.action === 'created') {
      break
    }
    clearTimeout(waiting[0].timeout)
    const item = waiting.shift()
    if (item) output([item.event])
  }
}

async function winDetectMove(
  channel,
  output,
  opts /*: WinDetectMoveOptions */
) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Wait for a new batch of events
    const events = await channel.pop()
    const {
      pouch,
      state: {
        [STEP_NAME]: { pendingItems, unmergedRenamedEvents }
      }
    } = opts

    for (const event of events) {
      // First, push the new events in the pending queue
      const found = await findDeletedIno(event, pouch, unmergedRenamedEvents)
      const { deletedIno } = found

      assignDebugInfos(event, found)

      const timeout = setTimeout(() => {
        const pendingItem = pendingItems.shift()
        if (pendingItem) output([pendingItem.event])
        sendReadyBatches(pendingItems, output)
      }, DELAY)
      pendingItems.push({ event, deletedIno, timeout })

      // Then, see if a created event matches a deleted event
      const pendingIndex = indexOfMatchingEvent(event, pendingItems, deletedIno)
      if (pendingIndex !== -1) {
        if (event.action === 'created') {
          const pendingDeleted = pendingItems[pendingIndex]

          clearTimeout(pendingDeleted.timeout)
          pendingItems.splice(pendingIndex, 1)
          aggregateEvents(event, pendingDeleted.event)

          if (event.action === 'renamed') {
            unmergedRenamedEvents.add(event)
          }
        } else if (event.action === 'deleted') {
          const pendingCreated = pendingItems[pendingIndex]
          const deletedIndex = pendingItems.findIndex(
            pending => pending.event === event
          )
          const pendingDeleted = pendingItems[deletedIndex]

          clearTimeout(pendingDeleted.timeout)
          pendingItems.splice(deletedIndex, 1)
          aggregateEvents(pendingCreated.event, event)

          if (pendingCreated.event.action === 'renamed') {
            unmergedRenamedEvents.add(pendingCreated.event)
          }
        }
      } else if (event.action === 'renamed') {
        unmergedRenamedEvents.add(event)
      }
    }

    // Finally, look if some batches can be sent without waiting
    sendReadyBatches(pendingItems, output)
  }
}

function loop(
  channel /*: Channel */,
  opts /*: WinDetectMoveOptions */
) /*: Channel */ {
  const out = new Channel()
  const output = batch => {
    out.push(batch)
  }
  winDetectMove(channel, output, opts).catch(err => {
    log.warn({ err })
  })
  return out
}
